import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

import app from "../../src/app.js";
import { verifyPassword } from "../../src/lib/password.js";
import { isPendingCustomerRegistrationTokenValid } from "../../src/services/customer-registration.service.js";
import {
  clearTestEmailOutbox,
  EmailDeliveryError,
  getTestEmailOutbox,
} from "../../src/services/email.service.js";
import * as emailService from "../../src/services/email.service.js";
import { resetDatabase, testPrisma } from "../helpers/test-db.js";
import { createFixtureCustomer, createFixtureUser, FIXTURE_PASSWORD } from "../helpers/fixtures.js";
import { loginAs } from "../helpers/integration-auth.js";

beforeEach(async () => {
  await resetDatabase();
  clearTestEmailOutbox();
  vi.restoreAllMocks();
});

function registrationData(overrides: Record<string, unknown> = {}) {
  return {
    name: "João Cliente",
    email: "  Joao.Cliente@Example.COM  ",
    password: "senha123456",
    phone: "11999998888",
    document: "12345678900",
    address: "Rua Exemplo, 10",
    ...overrides,
  };
}

function tokenFromLatestCustomerRegistrationEmail() {
  const url = getTestEmailOutbox().at(-1)?.customerRegistrationUrl;
  if (!url) throw new Error("E-mail de cadastro pendente não encontrado no outbox de teste");
  return new URL(url).searchParams.get("token") ?? "";
}

describe("POST /auth/customer/register — cadastro público pendente", () => {
  it("cria somente pending e token seguro, com e-mail normalizado", async () => {
    const before = {
      users: await testPrisma.user.count(),
      customers: await testPrisma.customer.count(),
      accounts: await testPrisma.customerAccount.count(),
    };

    const response = await request(app)
      .post("/auth/customer/register")
      .send(registrationData());

    expect(response.status).toBe(202);
    expect(response.body).toEqual({
      message: "Se os dados forem válidos, enviaremos um e-mail para confirmação.",
    });
    expect(JSON.stringify(response.body)).not.toContain("senha123456");

    const pending = await testPrisma.pendingCustomerRegistration.findUniqueOrThrow({
      where: { email: "joao.cliente@example.com" },
      include: { verificationToken: true },
    });
    expect(pending.name).toBe("João Cliente");
    expect(pending.passwordHash).not.toBe("senha123456");
    expect(pending.passwordHash.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword(pending.passwordHash, "senha123456")).toBe(true);
    expect(pending.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(pending.verificationToken?.expiresAt.getTime()).toBeGreaterThan(Date.now());

    const rawToken = tokenFromLatestCustomerRegistrationEmail();
    expect(rawToken.length).toBeGreaterThanOrEqual(40);
    expect(pending.verificationToken?.tokenHash).not.toBe(rawToken);
    expect(await isPendingCustomerRegistrationTokenValid(rawToken)).toBe(true);
    expect(getTestEmailOutbox().at(-1)?.to).toBe("joao.cliente@example.com");

    expect(await testPrisma.user.count()).toBe(before.users);
    expect(await testPrisma.customer.count()).toBe(before.customers);
    expect(await testPrisma.customerAccount.count()).toBe(before.accounts);
  });

  it("mantém um pending e somente o token mais recente válido", async () => {
    await request(app).post("/auth/customer/register").send(registrationData());
    const oldToken = tokenFromLatestCustomerRegistrationEmail();

    await request(app).post("/auth/customer/register").send(
      registrationData({ name: "João Atualizado", password: "nova-senha-123" }),
    );
    const newToken = tokenFromLatestCustomerRegistrationEmail();

    expect(await testPrisma.pendingCustomerRegistration.count()).toBe(1);
    expect(await testPrisma.pendingCustomerRegistrationToken.count()).toBe(1);
    expect(newToken).not.toBe(oldToken);
    expect(await isPendingCustomerRegistrationTokenValid(oldToken)).toBe(false);
    expect(await isPendingCustomerRegistrationTokenValid(newToken)).toBe(true);

    const pending = await testPrisma.pendingCustomerRegistration.findUniqueOrThrow({
      where: { email: "joao.cliente@example.com" },
    });
    expect(pending.name).toBe("João Atualizado");
    expect(await verifyPassword(pending.passwordHash, "nova-senha-123")).toBe(true);
  });

  it("mantém /auth/register como alias seguro sem criar User(CUSTOMER)", async () => {
    const response = await request(app).post("/auth/register").send(registrationData());

    expect(response.status).toBe(202);
    expect(await testPrisma.pendingCustomerRegistration.count()).toBe(1);
    expect(await testPrisma.user.count()).toBe(0);
    expect(await testPrisma.customer.count()).toBe(0);
  });

  it("rejeita dados inválidos antes de persistir", async () => {
    const response = await request(app).post("/auth/customer/register").send(
      registrationData({ email: "invalido", password: "123" }),
    );

    expect(response.status).toBe(400);
    expect(await testPrisma.pendingCustomerRegistration.count()).toBe(0);
  });

  it("ignora mass assignment e nunca cria identidade User", async () => {
    const response = await request(app).post("/auth/customer/register").send(
      registrationData({ role: "ADMIN", isPrimaryAdmin: true }),
    );

    expect(response.status).toBe(202);
    expect(await testPrisma.user.count()).toBe(0);
  });
});

describe("Cadastro pendente — conflitos sem enumeração", () => {
  it("responde igual e não cria pending para e-mail de User existente", async () => {
    await createFixtureUser("ATTENDANT", { email: "joao.cliente@example.com" });

    const response = await request(app)
      .post("/auth/customer/register")
      .send(registrationData());

    expect(response.status).toBe(202);
    expect(response.body.message).toBe("Se os dados forem válidos, enviaremos um e-mail para confirmação.");
    expect(await testPrisma.pendingCustomerRegistration.count()).toBe(0);
    expect(getTestEmailOutbox()).toHaveLength(0);
  });

  it("responde igual e não cria pending para CustomerAccount existente", async () => {
    const customer = await createFixtureCustomer();
    await testPrisma.customerAccount.create({
      data: {
        customerId: customer.id,
        email: "joao.cliente@example.com",
        passwordHash: "hash-existente",
      },
    });

    const response = await request(app)
      .post("/auth/customer/register")
      .send(registrationData({ document: "documento-novo" }));

    expect(response.status).toBe(202);
    expect(await testPrisma.pendingCustomerRegistration.count()).toBe(0);
    expect(await testPrisma.customerAccount.count()).toBe(1);
  });

  it("não vincula Customer existente por documento", async () => {
    await createFixtureCustomer({ document: "12345678900" });

    const response = await request(app)
      .post("/auth/customer/register")
      .send(registrationData());

    expect(response.status).toBe(202);
    expect(await testPrisma.pendingCustomerRegistration.count()).toBe(0);
    expect(await testPrisma.customer.count()).toBe(1);
    expect(await testPrisma.customerAccount.count()).toBe(0);
  });
});

describe("POST /auth/customer/register/resend", () => {
  it("rotaciona o token e mantém resposta genérica", async () => {
    await request(app).post("/auth/customer/register").send(registrationData());
    const oldToken = tokenFromLatestCustomerRegistrationEmail();

    const response = await request(app)
      .post("/auth/customer/register/resend")
      .send({ email: " JOAO.CLIENTE@example.com " });
    const newToken = tokenFromLatestCustomerRegistrationEmail();

    expect(response.status).toBe(202);
    expect(response.body.message).toBe("Se os dados forem válidos, enviaremos um e-mail para confirmação.");
    expect(newToken).not.toBe(oldToken);
    expect(await isPendingCustomerRegistrationTokenValid(oldToken)).toBe(false);
    expect(await isPendingCustomerRegistrationTokenValid(newToken)).toBe(true);
    expect(await testPrisma.pendingCustomerRegistrationToken.count()).toBe(1);
  });

  it("não revela pending inexistente", async () => {
    const response = await request(app)
      .post("/auth/customer/register/resend")
      .send({ email: "inexistente@example.com" });

    expect(response.status).toBe(202);
    expect(response.body.message).toBe("Se os dados forem válidos, enviaremos um e-mail para confirmação.");
    expect(getTestEmailOutbox()).toHaveLength(0);
  });

  it("não renova pending expirado e considera token expirado inválido", async () => {
    await request(app).post("/auth/customer/register").send(registrationData());
    const token = tokenFromLatestCustomerRegistrationEmail();
    const pending = await testPrisma.pendingCustomerRegistration.findUniqueOrThrow({
      where: { email: "joao.cliente@example.com" },
    });
    await testPrisma.pendingCustomerRegistration.update({
      where: { id: pending.id },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });

    const response = await request(app)
      .post("/auth/customer/register/resend")
      .send({ email: pending.email });

    expect(response.status).toBe(202);
    expect(getTestEmailOutbox()).toHaveLength(1);
    expect(await isPendingCustomerRegistrationTokenValid(token)).toBe(false);
  });

  it("preserva o pending e invalida o token quando o provider falha", async () => {
    vi.spyOn(emailService, "sendCustomerRegistrationVerificationEmail")
      .mockRejectedValueOnce(new EmailDeliveryError());

    const response = await request(app)
      .post("/auth/customer/register")
      .send(registrationData());

    expect(response.status).toBe(503);
    const pending = await testPrisma.pendingCustomerRegistration.findUnique({
      where: { email: "joao.cliente@example.com" },
    });
    expect(pending).not.toBeNull();
    expect(await testPrisma.pendingCustomerRegistrationToken.count()).toBe(0);
  });
});

describe("CUSTOMER legado — regressão de acesso", () => {
  it("continua autenticando e acessando /auth/me", async () => {
    const { user } = await createFixtureUser("CUSTOMER");
    const session = await loginAs(app, user.email, FIXTURE_PASSWORD);

    const response = await request(app).get("/auth/me").set("Cookie", session.cookie);

    expect(response.status).toBe(200);
    expect(response.body.user.role).toBe("CUSTOMER");
  });

  it("continua sem acesso administrativo", async () => {
    const { user } = await createFixtureUser("CUSTOMER");
    const session = await loginAs(app, user.email, FIXTURE_PASSWORD);

    const response = await request(app).get("/users").set("Cookie", session.cookie);

    expect(response.status).toBe(403);
  });
});
