import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";

import app from "../../src/app.js";
import { hashPassword } from "../../src/lib/password.js";
import {
  clearTestEmailOutbox,
  getTestEmailOutbox,
} from "../../src/services/email.service.js";
import {
  createFixtureCustomer,
  createFixtureServiceOrder,
  createFixtureUser,
  FIXTURE_PASSWORD,
} from "../helpers/fixtures.js";
import { resetDatabase, testPrisma } from "../helpers/test-db.js";

const CUSTOMER_PASSWORD = "senha-cliente-segura-123";

beforeEach(async () => {
  await resetDatabase();
  clearTestEmailOutbox();
});

function cookieValue(cookies: string[], name: string) {
  return cookies
    .find((cookie) => cookie.startsWith(`${name}=`))
    ?.split(";")[0]
    .split("=")
    .slice(1)
    .join("=");
}

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
      email: overrides.email ?? "portal.cliente@example.com",
      passwordHash: await hashPassword(CUSTOMER_PASSWORD),
      status: overrides.status ?? "ACTIVE",
      emailVerifiedAt:
        "emailVerifiedAt" in overrides ? overrides.emailVerifiedAt : new Date(),
    },
  });
  return { customer, account };
}

async function customerLogin(email: string, password = CUSTOMER_PASSWORD) {
  return request(app).post("/auth/customer/login").send({ email, password });
}

async function requestCustomerResetToken(email: string) {
  await request(app).post("/auth/customer/forgot-password").send({ email });
  const resetUrl = getTestEmailOutbox().at(-1)?.customerPasswordResetUrl;
  const token = resetUrl ? new URL(resetUrl).searchParams.get("token") : null;
  if (!token) throw new Error("Token de reset de cliente ausente");
  return token;
}

function customerSessionCookies(response: Awaited<ReturnType<typeof customerLogin>>) {
  const cookies = response.headers["set-cookie"] as unknown as string[];
  const access = cookieValue(cookies, "customer_access_token");
  const refresh = cookieValue(cookies, "customer_refresh_token");
  const csrf = cookieValue(cookies, "customer_csrf_token");
  if (!access || !refresh || !csrf) throw new Error("Cookies de cliente ausentes");
  return {
    access,
    refresh,
    csrf,
    cookie: `customer_access_token=${access}; customer_refresh_token=${refresh}; customer_csrf_token=${csrf}`,
  };
}

describe("autenticação independente de CustomerAccount", () => {
  it("faz login, persiste somente hashes e retorna dados mínimos", async () => {
    const { account, customer } = await createCustomerAccount();

    const response = await customerLogin(account.email.toUpperCase());

    expect(response.status).toBe(200);
    expect(response.body.customerAccount).toMatchObject({
      id: account.id,
      email: account.email,
      customer: { id: customer.id, name: customer.name },
    });
    expect(response.body.customerAccount).not.toHaveProperty("passwordHash");
    const cookies = customerSessionCookies(response);
    const stored = await testPrisma.customerSessionRefreshToken.findFirstOrThrow();
    expect(stored.tokenHash).not.toBe(cookies.refresh);
    expect(stored.tokenHash).toHaveLength(64);
    expect(await testPrisma.refreshToken.count()).toBe(0);
  });

  it.each([
    ["inexistente@example.com", CUSTOMER_PASSWORD],
    ["portal.cliente@example.com", "senha-incorreta"],
  ])("não enumera conta ou senha inválida", async (email, password) => {
    await createCustomerAccount();
    const response = await customerLogin(email, password);
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "E-mail ou senha inválidos." });
  });

  it.each([
    { status: "SUSPENDED" as const, emailVerifiedAt: new Date() },
    { status: "ACTIVE" as const, emailVerifiedAt: null },
  ])("usa a mesma resposta para conta inelegível", async (state) => {
    const { account } = await createCustomerAccount(state);
    const response = await customerLogin(account.email);
    expect(response.status).toBe(401);
    expect(response.body).toEqual({ error: "E-mail ou senha inválidos." });
  });

  it("mantém cookies e tokens totalmente separados do User legado", async () => {
    const { account } = await createCustomerAccount();
    const customerResponse = await customerLogin(account.email);
    const customerCookies = customerSessionCookies(customerResponse);
    const { user } = await createFixtureUser("ADMIN");
    const internal = await request(app)
      .post("/auth/login")
      .send({ email: user.email, password: FIXTURE_PASSWORD });
    const internalCookies = internal.headers["set-cookie"] as unknown as string[];

    expect(cookieValue(internalCookies, "access_token")).toBeTruthy();
    expect(cookieValue(internalCookies, "customer_access_token")).toBeUndefined();
    expect((await request(app).get("/auth/me").set(
      "Cookie",
      `customer_access_token=${customerCookies.access}`,
    )).status).toBe(401);
    expect((await request(app).get("/auth/customer/me").set(
      "Cookie",
      `access_token=${cookieValue(internalCookies, "access_token")}`,
    )).status).toBe(401);
  });
});

describe("refresh, reutilização e concorrência", () => {
  it("rotaciona em uso único e reutilização antiga revoga toda a família", async () => {
    const { account } = await createCustomerAccount();
    const login = customerSessionCookies(await customerLogin(account.email));
    const rotatedResponse = await request(app)
      .post("/auth/customer/refresh")
      .set("Cookie", `customer_refresh_token=${login.refresh}; customer_csrf_token=${login.csrf}`)
      .set("x-csrf-token", login.csrf);
    expect(rotatedResponse.status).toBe(200);
    const rotated = customerSessionCookies(rotatedResponse);
    expect(rotated.refresh).not.toBe(login.refresh);

    const reuse = await request(app)
      .post("/auth/customer/refresh")
      .set("Cookie", `customer_refresh_token=${login.refresh}; customer_csrf_token=${login.csrf}`)
      .set("x-csrf-token", login.csrf);
    expect(reuse.status).toBe(401);
    expect((await request(app)
      .post("/auth/customer/refresh")
      .set("Cookie", `customer_refresh_token=${rotated.refresh}; customer_csrf_token=${rotated.csrf}`)
      .set("x-csrf-token", rotated.csrf)).status).toBe(401);
    expect((await testPrisma.customerSession.findFirstOrThrow()).revokedAt).not.toBeNull();
  });

  it("serializa dois refreshes simultâneos do mesmo token", async () => {
    const { account } = await createCustomerAccount();
    const login = customerSessionCookies(await customerLogin(account.email));
    const refresh = () => request(app)
      .post("/auth/customer/refresh")
      .set("Cookie", `customer_refresh_token=${login.refresh}; customer_csrf_token=${login.csrf}`)
      .set("x-csrf-token", login.csrf);

    const responses = await Promise.all([refresh(), refresh()]);
    expect(responses.map(({ status }) => status).sort()).toEqual([200, 401]);
    expect(await testPrisma.customerSessionRefreshToken.count()).toBe(2);
    expect((await testPrisma.customerSession.findFirstOrThrow()).revokedAt).not.toBeNull();
  });

  it("rejeita refresh expirado e refresh de conta suspensa", async () => {
    const { account } = await createCustomerAccount();
    const expired = customerSessionCookies(await customerLogin(account.email));
    await testPrisma.customerSessionRefreshToken.updateMany({
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });
    expect((await request(app)
      .post("/auth/customer/refresh")
      .set("Cookie", `customer_refresh_token=${expired.refresh}; customer_csrf_token=${expired.csrf}`)
      .set("x-csrf-token", expired.csrf)).status).toBe(401);

    const fresh = customerSessionCookies(await customerLogin(account.email));
    await testPrisma.customerAccount.update({
      where: { id: account.id },
      data: { status: "SUSPENDED" },
    });
    expect((await request(app)
      .post("/auth/customer/refresh")
      .set("Cookie", `customer_refresh_token=${fresh.refresh}; customer_csrf_token=${fresh.csrf}`)
      .set("x-csrf-token", fresh.csrf)).status).toBe(401);
  });

  it("exige CSRF no refresh e logout quando há cookie de sessão", async () => {
    const { account } = await createCustomerAccount();
    const login = customerSessionCookies(await customerLogin(account.email));
    expect((await request(app)
      .post("/auth/customer/refresh")
      .set("Cookie", `customer_refresh_token=${login.refresh}`)).status).toBe(403);
    expect((await request(app)
      .post("/auth/customer/logout")
      .set("Cookie", `customer_refresh_token=${login.refresh}`)).status).toBe(403);
    expect((await request(app)
      .post("/auth/customer/logout")
      .set("Cookie", `customer_refresh_token=${login.refresh}; customer_csrf_token=${login.csrf}`)
      .set("x-csrf-token", "csrf-incorreto")).status).toBe(403);
  });

  it("logout revoga somente a sessão atual", async () => {
    const { account } = await createCustomerAccount();
    const first = customerSessionCookies(await customerLogin(account.email));
    const second = customerSessionCookies(await customerLogin(account.email));
    const logout = await request(app)
      .post("/auth/customer/logout")
      .set("Cookie", `customer_refresh_token=${first.refresh}; customer_csrf_token=${first.csrf}`)
      .set("x-csrf-token", first.csrf);
    expect(logout.status).toBe(204);
    expect((await request(app)
      .post("/auth/customer/refresh")
      .set("Cookie", `customer_refresh_token=${first.refresh}; customer_csrf_token=${first.csrf}`)
      .set("x-csrf-token", first.csrf)).status).toBe(401);
    expect((await request(app)
      .post("/auth/customer/refresh")
      .set("Cookie", `customer_refresh_token=${second.refresh}; customer_csrf_token=${second.csrf}`)
      .set("x-csrf-token", second.csrf)).status).toBe(200);
  });

  it("logout concorrente com refresh nunca deixa a família utilizável", async () => {
    const { account } = await createCustomerAccount();
    const login = customerSessionCookies(await customerLogin(account.email));
    const cookie = `customer_refresh_token=${login.refresh}; customer_csrf_token=${login.csrf}`;
    const [logout, refresh] = await Promise.all([
      request(app).post("/auth/customer/logout").set("Cookie", cookie)
        .set("x-csrf-token", login.csrf),
      request(app).post("/auth/customer/refresh").set("Cookie", cookie)
        .set("x-csrf-token", login.csrf),
    ]);
    expect(logout.status).toBe(204);
    expect([200, 401]).toContain(refresh.status);
    expect(await testPrisma.customerSession.count({ where: { revokedAt: null } })).toBe(0);
    if (refresh.status === 200) {
      const rotated = customerSessionCookies(refresh);
      expect((await request(app)
        .post("/auth/customer/refresh")
        .set("Cookie", `customer_refresh_token=${rotated.refresh}; customer_csrf_token=${rotated.csrf}`)
        .set("x-csrf-token", rotated.csrf)).status).toBe(401);
    }
  });
});

describe("me, suspensão e ownership", () => {
  it("exige autenticação e nunca retorna credenciais ou estado de sessão", async () => {
    expect((await request(app).get("/auth/customer/me")).status).toBe(401);
    const { account } = await createCustomerAccount();
    const session = customerSessionCookies(await customerLogin(account.email));
    const response = await request(app)
      .get("/auth/customer/me")
      .set("Cookie", session.cookie);
    expect(response.status).toBe(200);
    const serialized = JSON.stringify(response.body);
    expect(serialized).not.toContain("passwordHash");
    expect(serialized).not.toContain("tokenHash");
    expect(serialized).not.toContain("refreshToken");
  });

  it("recusa imediatamente uma sessão existente após suspensão", async () => {
    const { account } = await createCustomerAccount();
    const session = customerSessionCookies(await customerLogin(account.email));
    await testPrisma.customerAccount.update({
      where: { id: account.id },
      data: { status: "SUSPENDED" },
    });
    expect((await request(app)
      .get("/auth/customer/me")
      .set("Cookie", session.cookie)).status).toBe(401);
  });

  it("retorna somente o Customer próprio e somente suas ordens", async () => {
    const { account: accountA, customer: customerA } = await createCustomerAccount({
      email: "cliente.a@example.com",
    });
    const { customer: customerB } = await createCustomerAccount({
      email: "cliente.b@example.com",
    });
    const { user: attendant } = await createFixtureUser("ATTENDANT");
    const { user: technician } = await createFixtureUser("TECHNICIAN");
    const orderA = await createFixtureServiceOrder({
      customerId: customerA.id,
      createdById: attendant.id,
      technicianId: technician.id,
    });
    const orderB = await createFixtureServiceOrder({
      customerId: customerB.id,
      createdById: attendant.id,
    });
    const session = customerSessionCookies(await customerLogin(accountA.email));

    const me = await request(app).get("/auth/customer/me").set("Cookie", session.cookie);
    expect(me.status).toBe(200);
    expect(me.body.customerAccount.customer.id).toBe(customerA.id);
    const list = await request(app)
      .get(`/auth/customer/service-orders?customerId=${customerB.id}`)
      .set("Cookie", session.cookie);
    expect(list.status).toBe(200);
    expect(list.body.map((order: { id: string }) => order.id)).toEqual([orderA.id]);
    expect(list.body[0]).not.toHaveProperty("createdBy");
    expect(list.body[0].technician).not.toHaveProperty("email");
    expect((await request(app)
      .get(`/auth/customer/service-orders/${orderA.id}`)
      .set("Cookie", session.cookie)).status).toBe(200);
    expect((await request(app)
      .get(`/auth/customer/service-orders/${orderB.id}`)
      .set("Cookie", session.cookie)).status).toBe(404);
  });
});

describe("reset de senha revoga sessões de cliente", () => {
  it("revoga todas as CustomerSessions sem tocar no RefreshToken de User", async () => {
    const { account } = await createCustomerAccount();
    const customerSession = customerSessionCookies(await customerLogin(account.email));
    const { user } = await createFixtureUser("ADMIN");
    await request(app).post("/auth/login").send({
      email: user.email,
      password: FIXTURE_PASSWORD,
    });
    expect(await testPrisma.refreshToken.count({ where: { userId: user.id } })).toBe(1);

    const token = await requestCustomerResetToken(account.email);
    expect((await request(app).post("/auth/customer/reset-password").send({
      token,
      password: "senha-renovada-456",
    })).status).toBe(200);

    expect((await request(app)
      .post("/auth/customer/refresh")
      .set("Cookie", `customer_refresh_token=${customerSession.refresh}; customer_csrf_token=${customerSession.csrf}`)
      .set("x-csrf-token", customerSession.csrf)).status).toBe(401);
    expect(await testPrisma.refreshToken.count({
      where: { userId: user.id, revokedAt: null },
    })).toBe(1);
    expect((await customerLogin(account.email, CUSTOMER_PASSWORD)).status).toBe(401);
    expect((await customerLogin(account.email, "senha-renovada-456")).status).toBe(200);
  });

  it("reset concorrente com refresh sempre encerra a sessão anterior", async () => {
    const { account } = await createCustomerAccount();
    const session = customerSessionCookies(await customerLogin(account.email));
    const token = await requestCustomerResetToken(account.email);
    const [reset, refresh] = await Promise.all([
      request(app).post("/auth/customer/reset-password").send({
        token,
        password: "senha-concorrente-789",
      }),
      request(app)
        .post("/auth/customer/refresh")
        .set("Cookie", `customer_refresh_token=${session.refresh}; customer_csrf_token=${session.csrf}`)
        .set("x-csrf-token", session.csrf),
    ]);
    expect(reset.status).toBe(200);
    expect([200, 401]).toContain(refresh.status);
    expect(await testPrisma.customerSession.count({ where: { revokedAt: null } })).toBe(0);
    expect((await customerLogin(account.email, CUSTOMER_PASSWORD)).status).toBe(401);
    expect((await customerLogin(account.email, "senha-concorrente-789")).status).toBe(200);
  });
});
