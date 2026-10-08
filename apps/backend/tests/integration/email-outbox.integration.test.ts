import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

import app from "../../src/app.js";
import { hashPassword } from "../../src/lib/password.js";
import {
  clearTestEmailOutbox,
  getTestEmailOutbox,
} from "../../src/services/email.service.js";
import {
  isEmailOutboxWorkerRunning,
  processEmailOutboxBatch,
  startEmailOutboxWorker,
  stopEmailOutboxWorker,
} from "../../src/services/email-outbox.worker.js";
import { createFixtureCustomer } from "../helpers/fixtures.js";
import { resetDatabase, testPrisma } from "../helpers/test-db.js";

const originalEnv = { ...process.env };

function registration(email = "outbox.cadastro@example.com") {
  return {
    name: "Cliente Outbox",
    email,
    password: "senha-outbox-123",
    phone: "11999998888",
  };
}

async function createCustomerAccount(email = "outbox.reset@example.com") {
  const customer = await createFixtureCustomer();
  return testPrisma.customerAccount.create({
    data: {
      customerId: customer.id,
      email,
      passwordHash: await hashPassword("senha-original-123"),
      emailVerifiedAt: new Date(),
    },
  });
}

function configureMockBrevo(status: number) {
  process.env.NODE_ENV = "development";
  process.env.EMAIL_PROVIDER = "brevo";
  process.env.BREVO_API_KEY = "chave-de-teste";
  process.env.EMAIL_FROM = "remetente@example.com";
  process.env.EMAIL_OUTBOX_BACKOFF_BASE_MS = "1";
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(status < 300 ? JSON.stringify({ messageId: "provider-123" }) : null, {
        status,
      }),
    ),
  );
}

beforeEach(async () => {
  process.env = { ...originalEnv, NODE_ENV: "test" };
  await resetDatabase();
  clearTestEmailOutbox();
  vi.restoreAllMocks();
});

afterEach(async () => {
  await stopEmailOutboxWorker();
  process.env = { ...originalEnv };
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("outbox transacional de e-mail", () => {
  it("persiste cadastro, token e evento pendente sem chamar o provider", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await request(app)
      .post("/auth/customer/register")
      .send(registration());

    expect(response.status).toBe(202);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(await testPrisma.pendingCustomerRegistration.count()).toBe(1);
    expect(await testPrisma.pendingCustomerRegistrationToken.count()).toBe(1);
    const event = await testPrisma.emailOutbox.findFirstOrThrow();
    expect(event).toEqual(expect.objectContaining({
      type: "CUSTOMER_REGISTRATION_VERIFICATION",
      status: "PENDING",
      attempts: 0,
    }));
    expect(JSON.stringify(event.payload)).not.toContain("senha-outbox-123");
  });

  it("invalida evento antigo quando o reenvio rotaciona o token", async () => {
    const email = "outbox.reenvio@example.com";
    await request(app).post("/auth/customer/register").send(registration(email));

    const responses = await Promise.all([
      request(app).post("/auth/customer/register/resend").send({ email }),
      request(app).post("/auth/customer/register/resend").send({ email }),
    ]);

    expect(responses.map(({ status }) => status)).toEqual([202, 202]);
    expect(await testPrisma.pendingCustomerRegistrationToken.count()).toBe(1);
    expect(await testPrisma.emailOutbox.count({ where: { status: "PENDING" } })).toBe(1);
    expect(await testPrisma.emailOutbox.count({
      where: { status: "FAILED", lastError: "SUPERSEDED_TOKEN" },
    })).toBe(2);
  });

  it("serializa forgot-password concorrente e mantém somente o evento final ativo", async () => {
    const account = await createCustomerAccount();

    const responses = await Promise.all([
      request(app).post("/auth/customer/forgot-password").send({ email: account.email }),
      request(app).post("/auth/customer/forgot-password").send({ email: account.email }),
    ]);

    expect(responses.map(({ status }) => status)).toEqual([202, 202]);
    expect(await testPrisma.customerAccountPasswordResetToken.count()).toBe(1);
    expect(await testPrisma.emailOutbox.count({ where: { status: "PENDING" } })).toBe(1);
    expect(await testPrisma.emailOutbox.count({
      where: { status: "FAILED", lastError: "SUPERSEDED_TOKEN" },
    })).toBe(1);
  });

  it("dois workers concorrentes não enviam o mesmo evento simultaneamente", async () => {
    await request(app).post("/auth/customer/register").send(registration());

    const batches = await Promise.all([
      processEmailOutboxBatch(),
      processEmailOutboxBatch(),
    ]);

    expect(batches.reduce((total, batch) => total + batch.claimed, 0)).toBe(1);
    expect(getTestEmailOutbox()).toHaveLength(1);
    expect(await testPrisma.emailOutbox.count({ where: { status: "SENT" } })).toBe(1);
  });

  it("reagenda falha transitória com backoff sem invalidar o token", async () => {
    await request(app).post("/auth/customer/register").send(registration());
    configureMockBrevo(500);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const batch = await processEmailOutboxBatch();
    const event = await testPrisma.emailOutbox.findFirstOrThrow();

    expect(batch.retried).toBe(1);
    expect(event).toEqual(expect.objectContaining({
      status: "PENDING",
      attempts: 1,
      lastError: "BREVO_HTTP_500",
    }));
    expect(await testPrisma.pendingCustomerRegistrationToken.count()).toBe(1);
  });

  it("marca falha permanente sem retry para erro 4xx", async () => {
    await request(app).post("/auth/customer/register").send(registration());
    configureMockBrevo(400);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const batch = await processEmailOutboxBatch();
    const event = await testPrisma.emailOutbox.findFirstOrThrow();

    expect(batch.failed).toBe(1);
    expect(event).toEqual(expect.objectContaining({
      status: "FAILED",
      attempts: 1,
      lastError: "BREVO_HTTP_400",
    }));
  });

  it("respeita o máximo de tentativas para falha transitória", async () => {
    await request(app).post("/auth/customer/register").send(registration());
    configureMockBrevo(503);
    process.env.EMAIL_OUTBOX_MAX_ATTEMPTS = "1";
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const batch = await processEmailOutboxBatch();

    expect(batch.failed).toBe(1);
    expect(await testPrisma.emailOutbox.findFirst()).toEqual(
      expect.objectContaining({ status: "FAILED", attempts: 1 }),
    );
  });

  it("não envia evento cujo token foi consumido ou invalidado", async () => {
    await request(app).post("/auth/customer/register").send(registration());
    await testPrisma.pendingCustomerRegistrationToken.deleteMany();

    const batch = await processEmailOutboxBatch();

    expect(batch.skipped).toBe(1);
    expect(getTestEmailOutbox()).toHaveLength(0);
    expect(await testPrisma.emailOutbox.findFirst()).toEqual(
      expect.objectContaining({
        status: "FAILED",
        lastError: "STALE_OR_INVALID_TOKEN",
      }),
    );
  });

  it("recupera claim abandonado após a lease", async () => {
    await request(app).post("/auth/customer/register").send(registration());
    await testPrisma.emailOutbox.updateMany({
      data: {
        status: "PROCESSING",
        claimedAt: new Date(Date.now() - 120_000),
      },
    });

    const batch = await processEmailOutboxBatch();

    expect(batch.sent).toBe(1);
    expect(await testPrisma.emailOutbox.findFirst()).toEqual(
      expect.objectContaining({ status: "SENT", attempts: 1 }),
    );
  });

  it("mantém resposta uniforme sem aguardar nem chamar a Brevo", async () => {
    const account = await createCustomerAccount("timing.outbox@example.com");
    const fetchMock = vi.fn(() => new Promise<Response>(() => undefined));
    vi.stubGlobal("fetch", fetchMock);

    const [known, unknown] = await Promise.all([
      request(app).post("/auth/customer/forgot-password").send({ email: account.email }),
      request(app).post("/auth/customer/forgot-password").send({ email: "ausente@example.com" }),
    ]);

    expect(known.status).toBe(202);
    expect(unknown.status).toBe(202);
    expect(known.body).toEqual(unknown.body);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("inicia uma vez por processo e encerra o timer de forma controlada", async () => {
    process.env.NODE_ENV = "development";
    process.env.EMAIL_OUTBOX_POLL_INTERVAL_MS = "10000";

    startEmailOutboxWorker();
    startEmailOutboxWorker();
    expect(isEmailOutboxWorkerRunning()).toBe(true);

    await stopEmailOutboxWorker();
    expect(isEmailOutboxWorkerRunning()).toBe(false);
  });

  it("mantém RLS ativa e nenhuma permissão pública na tabela", async () => {
    const [rls] = await testPrisma.$queryRaw<Array<{ relrowsecurity: boolean }>>`
      SELECT "relrowsecurity"
      FROM "pg_class"
      WHERE "oid" = 'public."EmailOutbox"'::regclass
    `;
    const grants = await testPrisma.$queryRaw<Array<{ grantee: string }>>`
      SELECT "grantee"
      FROM "information_schema"."role_table_grants"
      WHERE "table_schema" = 'public'
        AND "table_name" = 'EmailOutbox'
        AND "grantee" IN ('anon', 'authenticated')
    `;

    expect(rls?.relrowsecurity).toBe(true);
    expect(grants).toEqual([]);
  });
});
