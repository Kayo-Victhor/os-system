import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";

import app from "../../src/app.js";
import { hashPassword } from "../../src/lib/password.js";
import { generateCustomerAccountPasswordResetToken } from "../../src/lib/tokens.js";
import {
  createFixtureCustomer,
  createFixtureServiceOrder,
  createFixtureUser,
  FIXTURE_PASSWORD,
} from "../helpers/fixtures.js";
import { loginAs } from "../helpers/integration-auth.js";
import { resetDatabase, testPrisma } from "../helpers/test-db.js";

const CUSTOMER_PASSWORD = "senha-lifecycle-segura-123";

beforeEach(async () => {
  await resetDatabase();
});

function cookieValue(cookies: string[], name: string) {
  return cookies
    .find((cookie) => cookie.startsWith(`${name}=`))
    ?.split(";")[0]
    .split("=")
    .slice(1)
    .join("=");
}

async function customerLogin(email: string) {
  return request(app)
    .post("/auth/customer/login")
    .send({ email, password: CUSTOMER_PASSWORD });
}

function customerCookies(response: Awaited<ReturnType<typeof customerLogin>>) {
  const cookies = response.headers["set-cookie"] as unknown as string[];
  const access = cookieValue(cookies, "customer_access_token");
  const refresh = cookieValue(cookies, "customer_refresh_token");
  const csrf = cookieValue(cookies, "customer_csrf_token");
  if (!access || !refresh || !csrf) throw new Error("Cookies de cliente ausentes");
  return { access, refresh, csrf };
}

async function createLifecycleFixture(options: { withOrder?: boolean } = {}) {
  const customer = await createFixtureCustomer({
    name: "Cliente com dados pessoais",
    email: "contato.lifecycle@example.com",
    phone: "11988776655",
    document: "DOC-LIFECYCLE-001",
    address: "Rua dos Testes, 9",
  });
  const account = await testPrisma.customerAccount.create({
    data: {
      customerId: customer.id,
      email: "lifecycle.account@example.com",
      passwordHash: await hashPassword(CUSTOMER_PASSWORD),
      emailVerifiedAt: new Date(),
    },
  });
  const { user: attendant } = await createFixtureUser("ATTENDANT");
  const order = options.withOrder
    ? await createFixtureServiceOrder({
        customerId: customer.id,
        createdById: attendant.id,
      })
    : null;
  return { customer, account, order };
}

async function adminSession() {
  const { user } = await createFixtureUser("ADMIN");
  return loginAs(app, user.email, FIXTURE_PASSWORD);
}

describe("ciclo de vida de CustomerAccount", () => {
  it("suspende, invalida credenciais e reativa sem restaurar sessões antigas", async () => {
    const { customer, account, order } = await createLifecycleFixture({ withOrder: true });
    const admin = await adminSession();
    const login = await customerLogin(account.email);
    const customerSession = customerCookies(login);
    const resetToken = generateCustomerAccountPasswordResetToken();
    await testPrisma.customerAccountPasswordResetToken.create({
      data: {
        customerAccountId: account.id,
        tokenHash: resetToken.tokenHash,
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const suspended = await request(app)
      .patch(`/customers/${customer.id}/account/status`)
      .set("Cookie", admin.cookie)
      .set("x-csrf-token", admin.csrfHeader)
      .send({ status: "SUSPENDED" });

    expect(suspended.status).toBe(200);
    expect(suspended.body.customerAccount.status).toBe("SUSPENDED");
    expect(await testPrisma.customerSession.count({
      where: { customerAccountId: account.id, revokedAt: null },
    })).toBe(0);
    expect(await testPrisma.customerSessionRefreshToken.count({
      where: {
        customerSession: { customerAccountId: account.id },
        consumedAt: null,
      },
    })).toBe(0);
    expect(await testPrisma.customerAccountPasswordResetToken.count()).toBe(0);
    expect(await testPrisma.customer.findUnique({ where: { id: customer.id } })).not.toBeNull();
    expect(await testPrisma.serviceOrder.findUnique({ where: { id: order!.id } })).not.toBeNull();
    expect((await customerLogin(account.email)).status).toBe(401);
    expect((await request(app)
      .post("/auth/customer/reset-password")
      .send({ token: resetToken.token, password: "nova-senha-segura-456" })).status).toBe(400);
    expect((await request(app)
      .get("/auth/customer/me")
      .set("Cookie", `customer_access_token=${customerSession.access}`)).status).toBe(401);

    const reactivated = await request(app)
      .patch(`/customers/${customer.id}/account/status`)
      .set("Cookie", admin.cookie)
      .set("x-csrf-token", admin.csrfHeader)
      .send({ status: "ACTIVE" });
    expect(reactivated.status).toBe(200);
    expect((await customerLogin(account.email)).status).toBe(200);
    expect((await request(app)
      .get("/auth/customer/me")
      .set("Cookie", `customer_access_token=${customerSession.access}`)).status).toBe(401);
  });

  it("exclui somente a conta de acesso e preserva Customer e ServiceOrder", async () => {
    const { customer, account, order } = await createLifecycleFixture({ withOrder: true });
    const admin = await adminSession();
    const session = customerCookies(await customerLogin(account.email));
    await testPrisma.customerAccountPasswordResetToken.create({
      data: {
        customerAccountId: account.id,
        tokenHash: "b".repeat(64),
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const response = await request(app)
      .delete(`/customers/${customer.id}/account`)
      .set("Cookie", admin.cookie)
      .set("x-csrf-token", admin.csrfHeader);

    expect(response.status).toBe(204);
    expect(await testPrisma.customerAccount.findUnique({ where: { id: account.id } })).toBeNull();
    expect(await testPrisma.customer.findUnique({ where: { id: customer.id } })).not.toBeNull();
    expect(await testPrisma.serviceOrder.findUnique({ where: { id: order!.id } })).not.toBeNull();
    expect(await testPrisma.customerSession.count({ where: { customerAccountId: account.id } })).toBe(0);
    expect(await testPrisma.customerAccountPasswordResetToken.count()).toBe(0);
    expect((await request(app)
      .post("/auth/customer/refresh")
      .set("Cookie", `customer_refresh_token=${session.refresh}; customer_csrf_token=${session.csrf}`)
      .set("x-csrf-token", session.csrf)).status).toBe(401);
  });

  it("anonimiza PII, remove a conta e preserva IDs e histórico", async () => {
    const { customer, account, order } = await createLifecycleFixture({ withOrder: true });
    const admin = await adminSession();
    const session = customerCookies(await customerLogin(account.email));

    const response = await request(app)
      .post(`/customers/${customer.id}/anonymize`)
      .set("Cookie", admin.cookie)
      .set("x-csrf-token", admin.csrfHeader)
      .send({});

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: customer.id,
      email: null,
      phone: null,
      document: null,
      address: null,
      customerAccount: null,
    });
    expect(response.body.name).toBe(`Cliente anonimizado (${customer.id.slice(0, 8)})`);
    expect(await testPrisma.customerAccount.findUnique({ where: { id: account.id } })).toBeNull();
    expect((await testPrisma.serviceOrder.findUniqueOrThrow({
      where: { id: order!.id },
    })).customerId).toBe(customer.id);
    expect((await customerLogin(account.email)).status).toBe(401);
    expect((await request(app)
      .get("/auth/customer/me")
      .set("Cookie", `customer_access_token=${session.access}`)).status).toBe(401);
  });
});

describe("hard delete e permissões administrativas", () => {
  it("recusa hard delete quando há histórico e permite quando não há", async () => {
    const withHistory = await createLifecycleFixture({ withOrder: true });
    const withoutHistory = await createFixtureCustomer();
    const admin = await adminSession();

    const refused = await request(app)
      .delete(`/customers/${withHistory.customer.id}`)
      .set("Cookie", admin.cookie)
      .set("x-csrf-token", admin.csrfHeader);
    expect(refused.status).toBe(409);
    expect(await testPrisma.customer.findUnique({
      where: { id: withHistory.customer.id },
    })).not.toBeNull();
    expect(await testPrisma.serviceOrder.findUnique({
      where: { id: withHistory.order!.id },
    })).not.toBeNull();

    const removed = await request(app)
      .delete(`/customers/${withoutHistory.id}`)
      .set("Cookie", admin.cookie)
      .set("x-csrf-token", admin.csrfHeader);
    expect(removed.status).toBe(204);
    expect(await testPrisma.customer.findUnique({
      where: { id: withoutHistory.id },
    })).toBeNull();
  });

  it.each(["ATTENDANT", "TECHNICIAN"] as const)(
    "%s não pode executar ações de lifecycle",
    async (role) => {
      const { customer } = await createLifecycleFixture();
      const { user } = await createFixtureUser(role);
      const session = await loginAs(app, user.email, FIXTURE_PASSWORD);
      const calls = [
        request(app)
          .patch(`/customers/${customer.id}/account/status`)
          .set("Cookie", session.cookie)
          .set("x-csrf-token", session.csrfHeader)
          .send({ status: "SUSPENDED" }),
        request(app)
          .delete(`/customers/${customer.id}/account`)
          .set("Cookie", session.cookie)
          .set("x-csrf-token", session.csrfHeader),
        request(app)
          .post(`/customers/${customer.id}/anonymize`)
          .set("Cookie", session.cookie)
          .set("x-csrf-token", session.csrfHeader)
          .send({}),
      ];

      const responses = await Promise.all(calls);
      expect(responses.map(({ status }) => status)).toEqual([403, 403, 403]);
      expect((await testPrisma.customerAccount.findUniqueOrThrow({
        where: { customerId: customer.id },
      })).status).toBe("ACTIVE");
    },
  );

  it("rejeita status e campos administrativos inesperados", async () => {
    const { customer, account } = await createLifecycleFixture();
    const admin = await adminSession();

    const invalidStatus = await request(app)
      .patch(`/customers/${customer.id}/account/status`)
      .set("Cookie", admin.cookie)
      .set("x-csrf-token", admin.csrfHeader)
      .send({ status: "DELETED" });
    const injectedOwnership = await request(app)
      .patch(`/customers/${customer.id}/account/status`)
      .set("Cookie", admin.cookie)
      .set("x-csrf-token", admin.csrfHeader)
      .send({ status: "SUSPENDED", customerId: "outro-cliente" });
    const injectedAnonymization = await request(app)
      .post(`/customers/${customer.id}/anonymize`)
      .set("Cookie", admin.cookie)
      .set("x-csrf-token", admin.csrfHeader)
      .send({ role: "ADMIN" });

    expect(invalidStatus.status).toBe(400);
    expect(injectedOwnership.status).toBe(400);
    expect(injectedAnonymization.status).toBe(400);
    expect((await testPrisma.customerAccount.findUniqueOrThrow({
      where: { id: account.id },
    })).status).toBe("ACTIVE");
  });
});

describe("concorrência de lifecycle", () => {
  it("suspensão prevalece sobre refresh concorrente", async () => {
    const { customer, account } = await createLifecycleFixture();
    const admin = await adminSession();
    const session = customerCookies(await customerLogin(account.email));

    const [suspend, refresh] = await Promise.all([
      request(app)
        .patch(`/customers/${customer.id}/account/status`)
        .set("Cookie", admin.cookie)
        .set("x-csrf-token", admin.csrfHeader)
        .send({ status: "SUSPENDED" }),
      request(app)
        .post("/auth/customer/refresh")
        .set("Cookie", `customer_refresh_token=${session.refresh}; customer_csrf_token=${session.csrf}`)
        .set("x-csrf-token", session.csrf),
    ]);

    expect(suspend.status).toBe(200);
    expect([200, 401]).toContain(refresh.status);
    expect((await testPrisma.customerAccount.findUniqueOrThrow({
      where: { id: account.id },
    })).status).toBe("SUSPENDED");
    expect(await testPrisma.customerSession.count({
      where: { customerAccountId: account.id, revokedAt: null },
    })).toBe(0);
  });

  it("exclusão de conta prevalece sobre login concorrente", async () => {
    const { customer, account } = await createLifecycleFixture();
    const admin = await adminSession();

    const [removed, login] = await Promise.all([
      request(app)
        .delete(`/customers/${customer.id}/account`)
        .set("Cookie", admin.cookie)
        .set("x-csrf-token", admin.csrfHeader),
      customerLogin(account.email),
    ]);

    expect(removed.status).toBe(204);
    expect([200, 401]).toContain(login.status);
    expect(await testPrisma.customerAccount.findUnique({ where: { id: account.id } })).toBeNull();
    expect(await testPrisma.customerSession.count({ where: { customerAccountId: account.id } })).toBe(0);
  });

  it("anonimização prevalece sobre consulta concorrente sem apagar a OS", async () => {
    const { customer, account, order } = await createLifecycleFixture({ withOrder: true });
    const admin = await adminSession();
    const session = customerCookies(await customerLogin(account.email));

    const [anonymized, read] = await Promise.all([
      request(app)
        .post(`/customers/${customer.id}/anonymize`)
        .set("Cookie", admin.cookie)
        .set("x-csrf-token", admin.csrfHeader)
        .send({}),
      request(app)
        .get(`/auth/customer/service-orders/${order!.id}`)
        .set("Cookie", `customer_access_token=${session.access}`),
    ]);

    expect(anonymized.status).toBe(200);
    // If middleware validates just before anonymization removes the account,
    // the ownership-aware query can legitimately finish as 404.
    expect([200, 401, 404]).toContain(read.status);
    expect(await testPrisma.customerAccount.findUnique({ where: { id: account.id } })).toBeNull();
    expect(await testPrisma.serviceOrder.findUnique({ where: { id: order!.id } })).not.toBeNull();
    expect((await request(app)
      .get("/auth/customer/me")
      .set("Cookie", `customer_access_token=${session.access}`)).status).toBe(401);
  });
});
