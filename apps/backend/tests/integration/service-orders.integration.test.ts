import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";

import app from "../../src/app.js";
import { resetDatabase, testPrisma } from "../helpers/test-db.js";
import {
  createFixtureUser,
  createFixtureCustomer,
  createFixtureServiceOrder,
  FIXTURE_PASSWORD,
} from "../helpers/fixtures.js";
import { loginAs } from "../helpers/integration-auth.js";

beforeEach(async () => {
  await resetDatabase();
});

describe("End-to-end service order flow", () => {
  it("create customer -> create technician -> create OS -> assign -> change status -> query -> verify relationships", async () => {
    const { user: admin } = await createFixtureUser("ADMIN");
    const adminSession = await loginAs(app, admin.email, FIXTURE_PASSWORD);

    // 1. Create customer
    const customerRes = await request(app)
      .post("/customers")
      .set("Cookie", adminSession.cookie)
      .set("x-csrf-token", adminSession.csrfHeader)
      .send({ name: "Cliente E2E", email: "cliente-e2e@example.com" });
    expect(customerRes.status).toBe(201);
    const customerId = customerRes.body.id;

    // 2. Create technician
    const techRes = await request(app)
      .post("/users")
      .set("Cookie", adminSession.cookie)
      .set("x-csrf-token", adminSession.csrfHeader)
      .send({
        name: "Técnico E2E",
        email: "tecnico-e2e@example.com",
        password: FIXTURE_PASSWORD,
        role: "TECHNICIAN",
      });
    expect(techRes.status).toBe(201);
    const technicianId = techRes.body.id;

    // 3. Create OS (associated with the customer at creation time)
    const createOsRes = await request(app)
      .post("/service-orders")
      .set("Cookie", adminSession.cookie)
      .set("x-csrf-token", adminSession.csrfHeader)
      .send({
        title: "Reparar equipamento",
        description: "Equipamento não liga",
        priority: "HIGH",
        customerId,
      });
    expect(createOsRes.status).toBe(201);
    const osId = createOsRes.body.id;
    expect(createOsRes.body.status).toBe("OPEN");

    // 4. Associate technician
    const assignRes = await request(app)
      .patch(`/service-orders/${osId}/technician`)
      .set("Cookie", adminSession.cookie)
      .set("x-csrf-token", adminSession.csrfHeader)
      .send({ technicianId });
    expect(assignRes.status).toBe(200);
    expect(assignRes.body.technicianId).toBe(technicianId);

    // 5. Technician changes status (their own assigned order)
    const techSession = await loginAs(app, "tecnico-e2e@example.com", FIXTURE_PASSWORD);
    const statusRes = await request(app)
      .patch(`/service-orders/${osId}/status`)
      .set("Cookie", techSession.cookie)
      .set("x-csrf-token", techSession.csrfHeader)
      .send({ status: "IN_PROGRESS" });
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.status).toBe("IN_PROGRESS");

    const completeRes = await request(app)
      .patch(`/service-orders/${osId}/status`)
      .set("Cookie", techSession.cookie)
      .set("x-csrf-token", techSession.csrfHeader)
      .send({ status: "COMPLETED" });
    expect(completeRes.status).toBe(200);
    expect(completeRes.body.status).toBe("COMPLETED");

    // 6. Query and verify relationships are fully populated
    const detailRes = await request(app)
      .get(`/service-orders/${osId}`)
      .set("Cookie", adminSession.cookie);

    expect(detailRes.status).toBe(200);
    expect(detailRes.body.customer.id).toBe(customerId);
    expect(detailRes.body.customer.name).toBe("Cliente E2E");
    expect(detailRes.body.technician.id).toBe(technicianId);
    expect(detailRes.body.technician.name).toBe("Técnico E2E");
    expect(detailRes.body.createdBy.id).toBe(admin.id);
    expect(detailRes.body.status).toBe("COMPLETED");

    // Also verify directly against the database, not just the API's view.
    const dbRecord = await testPrisma.serviceOrder.findUniqueOrThrow({ where: { id: osId } });
    expect(dbRecord.customerId).toBe(customerId);
    expect(dbRecord.technicianId).toBe(technicianId);
    expect(dbRecord.createdById).toBe(admin.id);
    expect(dbRecord.status).toBe("COMPLETED");
  });
});

describe("POST /service-orders — invalid input", () => {
  it("rejects a nonexistent customerId", async () => {
    const { user } = await createFixtureUser("USER");
    const session = await loginAs(app, user.email, FIXTURE_PASSWORD);

    const res = await request(app)
      .post("/service-orders")
      .set("Cookie", session.cookie)
      .set("x-csrf-token", session.csrfHeader)
      .send({
        title: "X",
        description: "Y",
        customerId: "00000000-0000-0000-0000-000000000000",
      });

    // FK violation surfaces via mapPrismaError (P2003 -> 409) rather than
    // a raw 500 — the order simply cannot reference a customer that
    // doesn't exist.
    expect([400, 409]).toContain(res.status);

    const count = await testPrisma.serviceOrder.count();
    expect(count).toBe(0);
  });

  it("rejects missing required fields", async () => {
    const { user } = await createFixtureUser("USER");
    const session = await loginAs(app, user.email, FIXTURE_PASSWORD);

    const res = await request(app)
      .post("/service-orders")
      .set("Cookie", session.cookie)
      .set("x-csrf-token", session.csrfHeader)
      .send({ title: "Only a title" });

    expect(res.status).toBe(400);
  });

  it.each(["TECHNICIAN", "CUSTOMER"] as const)("a %s cannot create a service order (403)", async (role) => {
    const { user } = await createFixtureUser(role);
    const customer = await createFixtureCustomer();
    const session = await loginAs(app, user.email, FIXTURE_PASSWORD);

    const res = await request(app)
      .post("/service-orders")
      .set("Cookie", session.cookie)
      .set("x-csrf-token", session.csrfHeader)
      .send({ title: "X", description: "Y", customerId: customer.id });

    expect(res.status).toBe(403);
  });
});

describe("GET /service-orders/:id — nonexistent resource", () => {
  it("returns 404", async () => {
    const { user } = await createFixtureUser("USER");
    const session = await loginAs(app, user.email, FIXTURE_PASSWORD);

    const res = await request(app)
      .get("/service-orders/00000000-0000-0000-0000-000000000000")
      .set("Cookie", session.cookie);

    expect(res.status).toBe(404);
  });
});

describe("PATCH /service-orders/:id/status — validation and authorization", () => {
  it("rejects an invalid status value", async () => {
    const { user: admin } = await createFixtureUser("ADMIN");
    const customer = await createFixtureCustomer();
    const order = await createFixtureServiceOrder({ customerId: customer.id, createdById: admin.id });
    const session = await loginAs(app, admin.email, FIXTURE_PASSWORD);

    const res = await request(app)
      .patch(`/service-orders/${order.id}/status`)
      .set("Cookie", session.cookie)
      .set("x-csrf-token", session.csrfHeader)
      .send({ status: "NOT_A_REAL_STATUS" });

    expect(res.status).toBe(400);
  });

  it("returns 404 for a nonexistent order", async () => {
    const { user: admin } = await createFixtureUser("ADMIN");
    const session = await loginAs(app, admin.email, FIXTURE_PASSWORD);

    const res = await request(app)
      .patch("/service-orders/00000000-0000-0000-0000-000000000000/status")
      .set("Cookie", session.cookie)
      .set("x-csrf-token", session.csrfHeader)
      .send({ status: "IN_PROGRESS" });

    expect(res.status).toBe(404);
  });

  it("blocks a technician from updating the status of an order assigned to someone else", async () => {
    const { user: admin } = await createFixtureUser("ADMIN");
    const { user: tech1 } = await createFixtureUser("TECHNICIAN");
    const { user: tech2 } = await createFixtureUser("TECHNICIAN");
    const customer = await createFixtureCustomer();
    const order = await createFixtureServiceOrder({
      customerId: customer.id,
      createdById: admin.id,
      technicianId: tech1.id,
    });

    const tech2Session = await loginAs(app, tech2.email, FIXTURE_PASSWORD);

    const res = await request(app)
      .patch(`/service-orders/${order.id}/status`)
      .set("Cookie", tech2Session.cookie)
      .set("x-csrf-token", tech2Session.csrfHeader)
      .send({ status: "IN_PROGRESS" });

    expect(res.status).toBe(403);

    const stillOpen = await testPrisma.serviceOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(stillOpen.status).toBe("OPEN");
  });

  it("blocks a technician from updating an unassigned order", async () => {
    const { user: admin } = await createFixtureUser("ADMIN");
    const { user: tech } = await createFixtureUser("TECHNICIAN");
    const customer = await createFixtureCustomer();
    const order = await createFixtureServiceOrder({ customerId: customer.id, createdById: admin.id });

    const session = await loginAs(app, tech.email, FIXTURE_PASSWORD);

    const res = await request(app)
      .patch(`/service-orders/${order.id}/status`)
      .set("Cookie", session.cookie)
      .set("x-csrf-token", session.csrfHeader)
      .send({ status: "IN_PROGRESS" });

    expect(res.status).toBe(403);
  });

  it.each(["USER", "CUSTOMER"] as const)("a %s cannot update order status at all (403)", async (role) => {
    const { user: admin } = await createFixtureUser("ADMIN");
    const { user } = await createFixtureUser(role);
    const customer = await createFixtureCustomer();
    const order = await createFixtureServiceOrder({ customerId: customer.id, createdById: admin.id });
    const session = await loginAs(app, user.email, FIXTURE_PASSWORD);

    const res = await request(app)
      .patch(`/service-orders/${order.id}/status`)
      .set("Cookie", session.cookie)
      .set("x-csrf-token", session.csrfHeader)
      .send({ status: "IN_PROGRESS" });

    expect(res.status).toBe(403);
  });
});

describe("PATCH /service-orders/:id/technician — assignment", () => {
  it("rejects assigning a nonexistent technician", async () => {
    const { user: admin } = await createFixtureUser("ADMIN");
    const customer = await createFixtureCustomer();
    const order = await createFixtureServiceOrder({ customerId: customer.id, createdById: admin.id });
    const session = await loginAs(app, admin.email, FIXTURE_PASSWORD);

    const res = await request(app)
      .patch(`/service-orders/${order.id}/technician`)
      .set("Cookie", session.cookie)
      .set("x-csrf-token", session.csrfHeader)
      .send({ technicianId: "00000000-0000-0000-0000-000000000000" });

    expect(res.status).toBe(400);
  });

  it("rejects assigning a user who is not a TECHNICIAN", async () => {
    const { user: admin } = await createFixtureUser("ADMIN");
    const { user: staff } = await createFixtureUser("USER");
    const customer = await createFixtureCustomer();
    const order = await createFixtureServiceOrder({ customerId: customer.id, createdById: admin.id });
    const session = await loginAs(app, admin.email, FIXTURE_PASSWORD);

    const res = await request(app)
      .patch(`/service-orders/${order.id}/technician`)
      .set("Cookie", session.cookie)
      .set("x-csrf-token", session.csrfHeader)
      .send({ technicianId: staff.id });

    expect(res.status).toBe(400);

    const unchanged = await testPrisma.serviceOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(unchanged.technicianId).toBeNull();
  });

  it.each(["USER", "TECHNICIAN", "CUSTOMER"] as const)("a %s cannot assign technicians (403)", async (role) => {
    const { user: admin } = await createFixtureUser("ADMIN");
    const { user } = await createFixtureUser(role);
    const { user: tech } = await createFixtureUser("TECHNICIAN");
    const customer = await createFixtureCustomer();
    const order = await createFixtureServiceOrder({ customerId: customer.id, createdById: admin.id });
    const session = await loginAs(app, user.email, FIXTURE_PASSWORD);

    const res = await request(app)
      .patch(`/service-orders/${order.id}/technician`)
      .set("Cookie", session.cookie)
      .set("x-csrf-token", session.csrfHeader)
      .send({ technicianId: tech.id });

    expect(res.status).toBe(403);
  });
});

describe("GET /service-orders — filtering and technician-scoped queries", () => {
  it("a technician can find the orders assigned to them via technicianId filter", async () => {
    const { user: admin } = await createFixtureUser("ADMIN");
    const { user: tech1 } = await createFixtureUser("TECHNICIAN");
    const { user: tech2 } = await createFixtureUser("TECHNICIAN");
    const customer = await createFixtureCustomer();

    await createFixtureServiceOrder({ customerId: customer.id, createdById: admin.id, technicianId: tech1.id });
    await createFixtureServiceOrder({ customerId: customer.id, createdById: admin.id, technicianId: tech1.id });
    await createFixtureServiceOrder({ customerId: customer.id, createdById: admin.id, technicianId: tech2.id });

    const session = await loginAs(app, tech1.email, FIXTURE_PASSWORD);

    const res = await request(app)
      .get("/service-orders")
      .query({ technicianId: tech1.id })
      .set("Cookie", session.cookie);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body.every((o: { technicianId: string }) => o.technicianId === tech1.id)).toBe(true);
  });

  it("filters by status", async () => {
    const { user: admin } = await createFixtureUser("ADMIN");
    const customer = await createFixtureCustomer();
    await createFixtureServiceOrder({ customerId: customer.id, createdById: admin.id, status: "OPEN" });
    await createFixtureServiceOrder({ customerId: customer.id, createdById: admin.id, status: "COMPLETED" });
    const session = await loginAs(app, admin.email, FIXTURE_PASSWORD);

    const res = await request(app)
      .get("/service-orders")
      .query({ status: "COMPLETED" })
      .set("Cookie", session.cookie);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].status).toBe("COMPLETED");
  });

  it("rejects an invalid status filter value", async () => {
    const { user } = await createFixtureUser("ADMIN");
    const session = await loginAs(app, user.email, FIXTURE_PASSWORD);

    const res = await request(app)
      .get("/service-orders")
      .query({ status: "NOT_REAL" })
      .set("Cookie", session.cookie);

    expect(res.status).toBe(400);
  });
});

describe("DELETE /service-orders/:id", () => {
  it("an ADMIN can delete a service order", async () => {
    const { user: admin } = await createFixtureUser("ADMIN");
    const customer = await createFixtureCustomer();
    const order = await createFixtureServiceOrder({ customerId: customer.id, createdById: admin.id });
    const session = await loginAs(app, admin.email, FIXTURE_PASSWORD);

    const res = await request(app)
      .delete(`/service-orders/${order.id}`)
      .set("Cookie", session.cookie)
      .set("x-csrf-token", session.csrfHeader);

    expect(res.status).toBe(204);
    expect(await testPrisma.serviceOrder.findUnique({ where: { id: order.id } })).toBeNull();
  });

  it.each(["USER", "TECHNICIAN", "CUSTOMER"] as const)("a %s cannot delete a service order (403)", async (role) => {
    const { user: admin } = await createFixtureUser("ADMIN");
    const { user } = await createFixtureUser(role);
    const customer = await createFixtureCustomer();
    const order = await createFixtureServiceOrder({ customerId: customer.id, createdById: admin.id });
    const session = await loginAs(app, user.email, FIXTURE_PASSWORD);

    const res = await request(app)
      .delete(`/service-orders/${order.id}`)
      .set("Cookie", session.cookie)
      .set("x-csrf-token", session.csrfHeader);

    expect(res.status).toBe(403);
  });
});
