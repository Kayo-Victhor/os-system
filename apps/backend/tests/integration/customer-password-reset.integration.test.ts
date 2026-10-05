import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";

import app from "../../src/app.js";
import { hashPassword, verifyPassword } from "../../src/lib/password.js";
import {
  clearTestEmailOutbox,
  getTestEmailOutbox,
} from "../../src/services/email.service.js";
import { createFixtureCustomer, createFixtureUser } from "../helpers/fixtures.js";
import { resetDatabase, testPrisma } from "../helpers/test-db.js";

const ORIGINAL_PASSWORD = "senha-original-123";
const NEW_PASSWORD = "senha-nova-segura-456";

beforeEach(async () => {
  await resetDatabase();
  clearTestEmailOutbox();
});

async function createCustomerAccount(
  overrides: Partial<{
    email: string;
    status: "ACTIVE" | "SUSPENDED";
    emailVerifiedAt: Date | null;
  }> = {},
) {
  const customer = await createFixtureCustomer();
  const account = await testPrisma.customerAccount.create({
    data: {
      customerId: customer.id,
      email: overrides.email ?? "cliente.reset@example.com",
      passwordHash: await hashPassword(ORIGINAL_PASSWORD),
      status: overrides.status ?? "ACTIVE",
      emailVerifiedAt:
        "emailVerifiedAt" in overrides ? overrides.emailVerifiedAt : new Date(),
    },
  });
  return { customer, account };
}

function latestCustomerResetToken() {
  const url = getTestEmailOutbox().at(-1)?.customerPasswordResetUrl;
  if (!url) throw new Error("E-mail de redefinição de cliente não encontrado");
  const token = new URL(url).searchParams.get("token");
  if (!token) throw new Error("Token de redefinição de cliente ausente");
  return token;
}

function forgot(email: string) {
  return request(app).post("/auth/customer/forgot-password").send({ email });
}

function reset(token: string, password = NEW_PASSWORD) {
  return request(app)
    .post("/auth/customer/reset-password")
    .send({ token, password });
}

describe("recuperação de senha exclusiva de CustomerAccount", () => {
  it("normaliza e-mail, cria somente HMAC e envia template específico", async () => {
    const { account } = await createCustomerAccount();

    const response = await forgot("  CLIENTE.RESET@EXAMPLE.COM  ");

    expect(response.status).toBe(202);
    expect(response.body).toEqual({
      message: "Se a conta existir, enviaremos instruções para redefinição de senha.",
    });
    expect(getTestEmailOutbox()).toHaveLength(1);
    expect(getTestEmailOutbox()[0].to).toBe(account.email);
    const rawToken = latestCustomerResetToken();
    const stored = await testPrisma.customerAccountPasswordResetToken.findUniqueOrThrow({
      where: { customerAccountId: account.id },
    });
    expect(stored.tokenHash).not.toBe(rawToken);
    expect(stored.tokenHash).toHaveLength(64);
    expect(JSON.stringify(response.body)).not.toContain(rawToken);
  });

  it("mantém resposta uniforme para conta inexistente sem criar token ou e-mail", async () => {
    const existing = await createCustomerAccount();
    const known = await forgot(existing.account.email);
    clearTestEmailOutbox();

    const unknown = await forgot("ausente@example.com");

    expect(unknown.status).toBe(202);
    expect(unknown.body).toEqual(known.body);
    expect(getTestEmailOutbox()).toHaveLength(0);
    expect(await testPrisma.customerAccountPasswordResetToken.count()).toBe(1);
  });

  it.each([
    { status: "SUSPENDED" as const, emailVerifiedAt: new Date() },
    { status: "ACTIVE" as const, emailVerifiedAt: null },
  ])("não inicia reset para conta inelegível sem revelar o motivo", async (state) => {
    const { account } = await createCustomerAccount(state);

    const response = await forgot(account.email);

    expect(response.status).toBe(202);
    expect(getTestEmailOutbox()).toHaveLength(0);
    expect(await testPrisma.customerAccountPasswordResetToken.count()).toBe(0);
  });

  it("rotaciona o token e invalida imediatamente o link anterior", async () => {
    const { account } = await createCustomerAccount();
    await forgot(account.email);
    const firstToken = latestCustomerResetToken();
    await forgot(account.email);
    const secondToken = latestCustomerResetToken();

    expect(secondToken).not.toBe(firstToken);
    expect(await testPrisma.customerAccountPasswordResetToken.count()).toBe(1);
    expect((await reset(firstToken)).status).toBe(400);
    expect((await reset(secondToken)).status).toBe(200);
  });

  it("atualiza somente CustomerAccount e impede reutilização", async () => {
    const { customer, account } = await createCustomerAccount();
    const { user } = await createFixtureUser("ATTENDANT", { email: account.email });
    const userPasswordBefore = user.password;
    await forgot(account.email);
    const token = latestCustomerResetToken();

    const response = await reset(token);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      message: "Senha redefinida com sucesso. Entre novamente para continuar.",
    });
    expect(JSON.stringify(response.body)).not.toContain(token);
    expect(JSON.stringify(response.body)).not.toContain(NEW_PASSWORD);
    const updatedAccount = await testPrisma.customerAccount.findUniqueOrThrow({
      where: { id: account.id },
    });
    expect(await verifyPassword(updatedAccount.passwordHash, ORIGINAL_PASSWORD)).toBe(false);
    expect(await verifyPassword(updatedAccount.passwordHash, NEW_PASSWORD)).toBe(true);
    expect(updatedAccount.email).toBe(account.email);
    expect(updatedAccount.customerId).toBe(customer.id);
    expect(updatedAccount.status).toBe(account.status);
    expect(updatedAccount.emailVerifiedAt).toEqual(account.emailVerifiedAt);
    expect((await testPrisma.user.findUniqueOrThrow({ where: { id: user.id } })).password)
      .toBe(userPasswordBefore);
    expect((await testPrisma.customer.findUniqueOrThrow({ where: { id: customer.id } })))
      .toEqual(customer);

    const stored = await testPrisma.customerAccountPasswordResetToken.findUniqueOrThrow({
      where: { customerAccountId: account.id },
    });
    expect(stored.usedAt).toBeInstanceOf(Date);
    expect((await reset(token, "terceira-senha-789")).status).toBe(400);
  });

  it("rejeita token expirado sem alterar a senha", async () => {
    const { account } = await createCustomerAccount();
    await forgot(account.email);
    const token = latestCustomerResetToken();
    await testPrisma.customerAccountPasswordResetToken.update({
      where: { customerAccountId: account.id },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });

    expect((await reset(token)).status).toBe(400);
    const unchanged = await testPrisma.customerAccount.findUniqueOrThrow({
      where: { id: account.id },
    });
    expect(await verifyPassword(unchanged.passwordHash, ORIGINAL_PASSWORD)).toBe(true);
  });

  it("serializa tentativas simultâneas e aceita o token somente uma vez", async () => {
    const { account } = await createCustomerAccount();
    await forgot(account.email);
    const token = latestCustomerResetToken();

    const responses = await Promise.all([reset(token), reset(token)]);

    expect(responses.map(({ status }) => status).sort()).toEqual([200, 400]);
    const stored = await testPrisma.customerAccountPasswordResetToken.findUniqueOrThrow({
      where: { customerAccountId: account.id },
    });
    expect(stored.usedAt).not.toBeNull();
  });

  it("mantém PasswordResetToken legado completamente separado", async () => {
    const { account } = await createCustomerAccount();
    const { user } = await createFixtureUser("CUSTOMER", { email: "legado@example.com" });

    await forgot(account.email);
    expect(await testPrisma.passwordResetToken.findUnique({ where: { userId: user.id } }))
      .toBeNull();
    expect(await testPrisma.customerAccountPasswordResetToken.count()).toBe(1);
  });

  it("valida e não aceita campos de identidade como autoridade", async () => {
    const { account } = await createCustomerAccount();
    await forgot(account.email);
    const token = latestCustomerResetToken();

    expect((await request(app).post("/auth/customer/reset-password").send({
      token: "curto",
      password: "curta",
    })).status).toBe(400);

    const response = await request(app).post("/auth/customer/reset-password").send({
      token,
      password: NEW_PASSWORD,
      customerAccountId: "00000000-0000-0000-0000-000000000000",
      userId: "00000000-0000-0000-0000-000000000000",
      email: "outra@example.com",
    });
    expect(response.status).toBe(200);
    expect(await testPrisma.customerAccount.findUnique({ where: { id: account.id } }))
      .not.toBeNull();
  });
});
