import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

import app from "../../src/app.js";
import {
  clearTestEmailOutbox,
  getTestEmailOutbox,
} from "../../src/services/email.service.js";
import { createFixtureCustomer, createFixtureUser } from "../helpers/fixtures.js";
import { resetDatabase, testPrisma } from "../helpers/test-db.js";

const registration = {
  name: "Cliente Confirmado",
  email: "cliente.confirmacao@example.com",
  password: "senha-segura-123",
  phone: "11999998888",
  address: "Rua da Confirmação, 10",
};

beforeEach(async () => {
  await resetDatabase();
  clearTestEmailOutbox();
  vi.restoreAllMocks();
});

async function createPending(overrides: Record<string, unknown> = {}) {
  const response = await request(app)
    .post("/auth/customer/register")
    .send({ ...registration, ...overrides });
  expect(response.status).toBe(202);

  const url = getTestEmailOutbox().at(-1)?.customerRegistrationUrl;
  if (!url) throw new Error("Link de confirmação não foi criado no outbox de teste");
  const token = new URL(url).searchParams.get("token");
  if (!token) throw new Error("Token ausente no link de confirmação de teste");

  return token;
}

function confirm(token: string) {
  return request(app)
    .post("/auth/customer/register/confirm")
    .send({ token });
}

describe("POST /auth/customer/register/confirm", () => {
  it("cria Customer e CustomerAccount ativos em uma única confirmação", async () => {
    const token = await createPending();
    const pending = await testPrisma.pendingCustomerRegistration.findUniqueOrThrow({
      where: { email: registration.email },
    });
    const before = {
      users: await testPrisma.user.count(),
      customers: await testPrisma.customer.count(),
      accounts: await testPrisma.customerAccount.count(),
    };

    const response = await confirm(token);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      message: "Cadastro confirmado com sucesso. Você já pode entrar.",
    });
    expect(JSON.stringify(response.body)).not.toContain(token);
    expect(JSON.stringify(response.body)).not.toContain(pending.passwordHash);

    const account = await testPrisma.customerAccount.findUniqueOrThrow({
      where: { email: registration.email },
      include: { customer: true },
    });
    expect(account.status).toBe("ACTIVE");
    expect(account.emailVerifiedAt).toBeInstanceOf(Date);
    expect(account.passwordHash).toBe(pending.passwordHash);
    expect(account.customer).toMatchObject({
      name: registration.name,
      email: registration.email,
      phone: registration.phone,
      address: registration.address,
    });
    expect(await testPrisma.user.count()).toBe(before.users);
    expect(await testPrisma.customer.count()).toBe(before.customers + 1);
    expect(await testPrisma.customerAccount.count()).toBe(before.accounts + 1);
    expect(await testPrisma.pendingCustomerRegistration.count()).toBe(0);
    expect(await testPrisma.pendingCustomerRegistrationToken.count()).toBe(0);
  });

  it("rejeita o reuso sem criar uma segunda identidade", async () => {
    const token = await createPending();
    expect((await confirm(token)).status).toBe(200);

    const reused = await confirm(token);

    expect(reused.status).toBe(400);
    expect(reused.body.error).toBe("Este link de confirmação é inválido ou expirou.");
    expect(await testPrisma.customer.count()).toBe(1);
    expect(await testPrisma.customerAccount.count()).toBe(1);
  });

  it("rejeita token expirado sem criar registros definitivos", async () => {
    const token = await createPending();
    await testPrisma.pendingCustomerRegistrationToken.updateMany({
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });

    expect((await confirm(token)).status).toBe(400);
    expect(await testPrisma.customer.count()).toBe(0);
    expect(await testPrisma.customerAccount.count()).toBe(0);
  });

  it("rejeita pending expirado sem criar registros definitivos", async () => {
    const token = await createPending();
    await testPrisma.pendingCustomerRegistration.updateMany({
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });

    expect((await confirm(token)).status).toBe(400);
    expect(await testPrisma.customer.count()).toBe(0);
    expect(await testPrisma.customerAccount.count()).toBe(0);
  });

  it("serializa duas confirmações simultâneas e cria somente uma identidade", async () => {
    const token = await createPending();

    const responses = await Promise.all([confirm(token), confirm(token)]);

    expect(responses.map(({ status }) => status).sort()).toEqual([200, 400]);
    expect(await testPrisma.customer.count()).toBe(1);
    expect(await testPrisma.customerAccount.count()).toBe(1);
    expect(await testPrisma.pendingCustomerRegistration.count()).toBe(0);
    expect(await testPrisma.pendingCustomerRegistrationToken.count()).toBe(0);
  });

  it("faz rollback quando o e-mail ganhou outra CustomerAccount", async () => {
    const token = await createPending();
    const existingCustomer = await createFixtureCustomer();
    await testPrisma.customerAccount.create({
      data: {
        customerId: existingCustomer.id,
        email: registration.email,
        passwordHash: "hash-existente",
      },
    });

    const response = await confirm(token);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: "Não foi possível confirmar este cadastro." });
    expect(await testPrisma.customer.count()).toBe(1);
    expect(await testPrisma.customerAccount.count()).toBe(1);
    expect(await testPrisma.pendingCustomerRegistration.count()).toBe(1);
  });

  it("mantém User de mesmo e-mail independente e inalterado", async () => {
    const token = await createPending();
    const { user } = await createFixtureUser("ATTENDANT", { email: registration.email });

    const response = await confirm(token);

    expect(response.status).toBe(200);
    expect(await testPrisma.user.findUnique({ where: { id: user.id } })).toEqual(user);
    expect(await testPrisma.user.count()).toBe(1);
    expect(await testPrisma.customerAccount.count()).toBe(1);
  });

  it("não reivindica Customer cadastralmente equivalente", async () => {
    const token = await createPending();
    const existing = await createFixtureCustomer({
      name: registration.name,
      email: registration.email,
      phone: registration.phone,
      address: registration.address,
    });

    expect((await confirm(token)).status).toBe(200);
    const account = await testPrisma.customerAccount.findUniqueOrThrow({
      where: { email: registration.email },
    });
    expect(account.customerId).not.toBe(existing.id);
    expect(await testPrisma.customer.count()).toBe(2);
  });

  it("não associa por documento coincidente e não deixa Customer parcial", async () => {
    const document = "12345678900";
    const token = await createPending({ document });
    const existing = await createFixtureCustomer({ document });

    const response = await confirm(token);

    expect(response.status).toBe(409);
    expect(await testPrisma.customer.count()).toBe(1);
    expect(await testPrisma.customer.findUnique({ where: { id: existing.id } })).not.toBeNull();
    expect(await testPrisma.customerAccount.count()).toBe(0);
    expect(await testPrisma.pendingCustomerRegistration.count()).toBe(1);
  });

  it("não registra token nem credenciais durante uma confirmação válida", async () => {
    const token = await createPending();
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await confirm(token);

    expect(response.status).toBe(200);
    expect(errorLog).not.toHaveBeenCalled();
    expect(JSON.stringify(response.body)).not.toContain(token);
    expect(JSON.stringify(response.body)).not.toContain("passwordHash");
  });

  it("rejeita payloads sem token válido", async () => {
    expect((await request(app).post("/auth/customer/register/confirm").send({})).status).toBe(400);
    expect((await confirm("token-curto")).status).toBe(400);
    expect(await testPrisma.customer.count()).toBe(0);
  });
});
