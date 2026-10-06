import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";

import app from "../../src/app.js";
import { clearTestEmailOutbox, getTestEmailOutbox } from "../../src/services/email.service.js";
import { createFixtureUser, FIXTURE_PASSWORD } from "../helpers/fixtures.js";
import { resetDatabase, testPrisma } from "../helpers/test-db.js";

beforeEach(async () => {
  await resetDatabase();
  clearTestEmailOutbox();
});

function latestResetToken() {
  const message = getTestEmailOutbox().at(-1);
  expect(message?.passwordResetUrl).toBeDefined();
  return new URL(message!.passwordResetUrl!).searchParams.get("token")!;
}

describe("recuperação segura de senha", () => {
  it("permite recuperação para usuário interno", async () => {
    const { user } = await createFixtureUser("ATTENDANT", {
      email: "atendente-reset@example.com",
    });

    const response = await request(app).post("/auth/forgot-password").send({ email: user.email });

    expect(response.status).toBe(202);
    expect(getTestEmailOutbox()).toHaveLength(1);
    expect(await testPrisma.passwordResetToken.findUnique({ where: { userId: user.id } })).not.toBeNull();
  });

  it("mantém a resposta uniforme, persiste somente HMAC e substitui o link anterior", async () => {
    const { user } = await createFixtureUser("ATTENDANT", { email: "reset@example.com" });

    const known = await request(app).post("/auth/forgot-password").send({ email: user.email });
    const firstToken = latestResetToken();
    const unknown = await request(app).post("/auth/forgot-password").send({ email: "ausente@example.com" });

    expect(known.status).toBe(202);
    expect(unknown.status).toBe(202);
    expect(known.body).toEqual(unknown.body);
    const stored = await testPrisma.passwordResetToken.findUniqueOrThrow({ where: { userId: user.id } });
    expect(stored.tokenHash).not.toContain(firstToken);

    await request(app).post("/auth/forgot-password").send({ email: user.email });
    const secondToken = latestResetToken();
    expect(secondToken).not.toBe(firstToken);

    const oldLink = await request(app).post("/auth/reset-password").send({ token: firstToken, password: "nova-senha123", passwordConfirmation: "nova-senha123" });
    expect(oldLink.status).toBe(400);
  });

  it("redefine a senha, revoga sessões ativas e impede reutilização", async () => {
    const { user } = await createFixtureUser("ATTENDANT", { email: "sessao-reset@example.com" });
    const login = await request(app).post("/auth/login").send({ email: user.email, password: FIXTURE_PASSWORD });
    expect(login.status).toBe(200);
    const cookies = login.headers["set-cookie"] as unknown as string[];

    await request(app).post("/auth/forgot-password").send({ email: user.email });
    const token = latestResetToken();
    const reset = await request(app).post("/auth/reset-password").send({ token, password: "nova-senha123", passwordConfirmation: "nova-senha123" });
    expect(reset.status).toBe(200);
    expect(reset.body.password).toBeUndefined();
    expect(reset.body.token).toBeUndefined();

    expect((await request(app).post("/auth/login").send({ email: user.email, password: FIXTURE_PASSWORD })).status).toBe(401);
    expect((await request(app).post("/auth/login").send({ email: user.email, password: "nova-senha123" })).status).toBe(200);

    const stored = await testPrisma.passwordResetToken.findUniqueOrThrow({ where: { userId: user.id } });
    expect(stored.usedAt).not.toBeNull();
    const refreshCookie = cookies.find((cookie) => cookie.startsWith("refresh_token="))!;
    const csrfCookie = cookies.find((cookie) => cookie.startsWith("csrf_token="))!;
    const csrfToken = csrfCookie.split(";")[0].split("=")[1];
    const oldRefresh = await request(app).post("/auth/refresh").set("Cookie", [refreshCookie, csrfCookie]).set("x-csrf-token", csrfToken);
    expect(oldRefresh.status).toBe(401);

    const replay = await request(app).post("/auth/reset-password").send({ token, password: "outra-senha123", passwordConfirmation: "outra-senha123" });
    expect(replay.status).toBe(400);
  });

  it("rejeita link expirado e valida senha e confirmação no backend", async () => {
    const { user } = await createFixtureUser("ATTENDANT", { email: "expirado-reset@example.com" });
    await request(app).post("/auth/forgot-password").send({ email: user.email });
    const token = latestResetToken();
    await testPrisma.passwordResetToken.update({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1_000) } });

    const expired = await request(app).post("/auth/reset-password").send({ token, password: "nova-senha123", passwordConfirmation: "nova-senha123" });
    expect(expired.status).toBe(400);
    expect((await request(app).post("/auth/reset-password").send({ token, password: "curta", passwordConfirmation: "diferente" })).status).toBe(400);
    expect((await request(app).post("/auth/forgot-password").send({ email: "invalido" })).status).toBe(400);
  });
});
