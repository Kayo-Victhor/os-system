import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";

import app from "../../src/app.js";
import { clearTestEmailOutbox, getTestEmailOutbox } from "../../src/services/email.service.js";
import { resetDatabase, testPrisma } from "../helpers/test-db.js";
import { createFixtureUser } from "../helpers/fixtures.js";

beforeEach(async () => {
  await resetDatabase();
  clearTestEmailOutbox();
});

function lastToken() {
  const message = getTestEmailOutbox().at(-1);
  expect(message).toBeDefined();
  return new URL(message!.verificationUrl).searchParams.get("token")!;
}

async function register(email = "cliente-verificacao@example.com") {
  return request(app).post("/auth/register").send({
    name: "Cliente de Verificação",
    email,
    password: "senha123456",
  });
}

describe("Verificação real de posse de e-mail", () => {
  it("não emite nem reenvia token para usuário interno", async () => {
    const { user } = await createFixtureUser("ADMIN", {
      email: "admin-sem-verificacao@example.com",
      emailVerifiedAt: null,
    });

    const resend = await request(app).post("/auth/resend-verification").send({ email: user.email });

    expect(resend.status).toBe(202);
    expect(getTestEmailOutbox()).toHaveLength(0);
    expect(await testPrisma.emailVerificationToken.findUnique({ where: { userId: user.id } })).toBeNull();
  });

  it("cria um token somente em hash, bloqueia login e confirma com link de uso único", async () => {
    const registration = await register();
    expect(registration.status).toBe(201);
    expect(getTestEmailOutbox()).toHaveLength(1);

    const user = await testPrisma.user.findUniqueOrThrow({ where: { email: "cliente-verificacao@example.com" } });
    expect(user.emailVerifiedAt).toBeNull();
    const stored = await testPrisma.emailVerificationToken.findUniqueOrThrow({ where: { userId: user.id } });
    expect(stored.tokenHash).not.toContain(lastToken());

    const blocked = await request(app).post("/auth/login").send({ email: user.email, password: "senha123456" });
    expect(blocked.status).toBe(403);

    const token = lastToken();
    const verified = await request(app).post("/auth/verify-email").send({ token });
    expect(verified.status).toBe(200);

    const verifiedUser = await testPrisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(verifiedUser.emailVerifiedAt).not.toBeNull();
    const consumed = await testPrisma.emailVerificationToken.findUniqueOrThrow({ where: { userId: user.id } });
    expect(consumed.usedAt).not.toBeNull();

    const replay = await request(app).post("/auth/verify-email").send({ token });
    expect(replay.status).toBe(400);

    const login = await request(app).post("/auth/login").send({ email: user.email, password: "senha123456" });
    expect(login.status).toBe(200);
  });

  it("rejects an expired token and replaces the old token when resending", async () => {
    await register("reenvio@example.com");
    const firstToken = lastToken();
    const user = await testPrisma.user.findUniqueOrThrow({ where: { email: "reenvio@example.com" } });

    await testPrisma.emailVerificationToken.update({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    const expired = await request(app).post("/auth/verify-email").send({ token: firstToken });
    expect(expired.status).toBe(400);

    const resend = await request(app).post("/auth/resend-verification").send({ email: user.email });
    expect(resend.status).toBe(202);
    expect(getTestEmailOutbox()).toHaveLength(2);
    const secondToken = lastToken();
    expect(secondToken).not.toBe(firstToken);

    const oldLink = await request(app).post("/auth/verify-email").send({ token: firstToken });
    expect(oldLink.status).toBe(400);
    const newLink = await request(app).post("/auth/verify-email").send({ token: secondToken });
    expect(newLink.status).toBe(200);
  });

  it("consome somente uma requisição concorrente e preserva token válido antes da expiração", async () => {
    await register("concorrente@example.com");
    const token = lastToken();
    const [first, second] = await Promise.all([
      request(app).post("/auth/verify-email").send({ token }),
      request(app).post("/auth/verify-email").send({ token }),
    ]);
    expect([first.status, second.status].sort()).toEqual([200, 400]);

    await register("limite@example.com");
    const nearExpiryToken = lastToken();
    const user = await testPrisma.user.findUniqueOrThrow({ where: { email: "limite@example.com" } });
    await testPrisma.emailVerificationToken.update({
      where: { userId: user.id },
      data: { expiresAt: new Date(Date.now() + 60_000) },
    });
    expect((await request(app).post("/auth/verify-email").send({ token: nearExpiryToken })).status).toBe(200);
  });

  it("keeps resend responses generic for unknown and verified e-mails", async () => {
    const unknown = await request(app).post("/auth/resend-verification").send({ email: "nao-existe@example.com" });
    expect(unknown.status).toBe(202);
    expect(getTestEmailOutbox()).toHaveLength(0);

    await register("confirmado@example.com");
    const token = lastToken();
    await request(app).post("/auth/verify-email").send({ token });
    const verified = await request(app).post("/auth/resend-verification").send({ email: "confirmado@example.com" });
    expect(verified.status).toBe(202);
    expect(getTestEmailOutbox()).toHaveLength(1);
  });

  it("strips mass-assignment fields from public registration", async () => {
    const response = await request(app).post("/auth/register").send({
      name: "Tentativa de escalada",
      email: "mass-assignment@example.com",
      password: "senha123456",
      role: "ADMIN",
      emailVerifiedAt: new Date().toISOString(),
      userId: "00000000-0000-0000-0000-000000000000",
      customerId: "00000000-0000-0000-0000-000000000000",
    });

    expect(response.status).toBe(201);
    const user = await testPrisma.user.findUniqueOrThrow({ where: { email: "mass-assignment@example.com" } });
    expect(user.role).toBe("CUSTOMER");
    expect(user.emailVerifiedAt).toBeNull();
  });
});
