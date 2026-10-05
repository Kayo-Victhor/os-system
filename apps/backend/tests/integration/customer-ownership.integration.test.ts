import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import app from "../../src/app.js";
import { resetDatabase, testPrisma } from "../helpers/test-db.js";
import { createFixtureCustomer, createFixtureServiceOrder, createFixtureUser, FIXTURE_PASSWORD } from "../helpers/fixtures.js";
import { loginAs } from "../helpers/integration-auth.js";

beforeEach(async () => { await resetDatabase(); });

describe("CUSTOMER ownership", () => {
  it("returns only the authenticated customer record and service orders", async () => {
    const { user: admin } = await createFixtureUser("ADMIN");
    const { user: customerA } = await createFixtureUser("CUSTOMER");
    const { user: customerB } = await createFixtureUser("CUSTOMER");
    const recordA = await createFixtureCustomer({ userId: customerA.id });
    const recordB = await createFixtureCustomer({ userId: customerB.id });
    const ownOrder = await createFixtureServiceOrder({ customerId: recordA.id, createdById: admin.id });
    const otherOrder = await createFixtureServiceOrder({ customerId: recordB.id, createdById: admin.id });
    const session = await loginAs(app, customerA.email, FIXTURE_PASSWORD);
    expect((await request(app).get("/customers/me").set("Cookie", session.cookie)).body.id).toBe(recordA.id);
    expect((await request(app).get("/customers/" + recordA.id).set("Cookie", session.cookie)).status).toBe(200);
    expect((await request(app).get("/customers/" + recordB.id).set("Cookie", session.cookie)).status).toBe(404);
    expect((await request(app).patch("/customers/" + recordB.id).set("Cookie", session.cookie).set("x-csrf-token", session.csrfHeader).send({ name: "Tentativa" })).status).toBe(404);
    const list = await request(app).get("/service-orders").query({ customerId: recordB.id }).set("Cookie", session.cookie);
    expect(list.status).toBe(200); expect(list.body).toHaveLength(1); expect(list.body[0].id).toBe(ownOrder.id);
    expect((await request(app).get("/service-orders/" + ownOrder.id).set("Cookie", session.cookie)).status).toBe(200);
    expect((await request(app).get("/service-orders/" + otherOrder.id).set("Cookie", session.cookie)).status).toBe(404);
  });

  it("preserves the unique legacy User(CUSTOMER) → Customer relation", async () => {
    const { user } = await createFixtureUser("CUSTOMER", { email: "novo@example.com" });
    const customer = await createFixtureCustomer({ userId: user.id, email: user.email });
    expect(customer.email).toBe("novo@example.com");
    expect(customer.userId).toBe(user.id);
    await expect(testPrisma.customer.create({ data: { name: "Duplicado", userId: user.id } })).rejects.toThrow();
  });
});
