import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";

import app from "../../src/app.js";
import { hashPassword } from "../../src/lib/password.js";
import {
  createFixtureCustomer,
  createFixtureServiceOrder,
  createFixtureUser,
  FIXTURE_PASSWORD,
} from "../helpers/fixtures.js";
import { loginAs } from "../helpers/integration-auth.js";
import { resetDatabase, testPrisma } from "../helpers/test-db.js";

const CUSTOMER_PASSWORD = "timeline-customer-password-123";

beforeEach(async () => {
  await resetDatabase();
});

async function customerCookie(customerId: string, email: string) {
  await testPrisma.customerAccount.create({
    data: {
      customerId,
      email,
      passwordHash: await hashPassword(CUSTOMER_PASSWORD),
      emailVerifiedAt: new Date(),
    },
  });
  const response = await request(app).post("/auth/customer/login").send({
    email,
    password: CUSTOMER_PASSWORD,
  });
  expect(response.status).toBe(200);
  return (response.headers["set-cookie"] as unknown as string[])
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

async function createOrderThroughApi() {
  const { user: admin } = await createFixtureUser("ADMIN");
  const customer = await createFixtureCustomer();
  const session = await loginAs(app, admin.email, FIXTURE_PASSWORD);
  const response = await request(app)
    .post("/service-orders")
    .set("Cookie", session.cookie)
    .set("x-csrf-token", session.csrfHeader)
    .send({
      title: "Falha operacional",
      description: "Equipamento sem conectividade",
      priority: "MEDIUM",
      customerId: customer.id,
    });
  expect(response.status).toBe(201);
  return { admin, customer, session, order: response.body as { id: string } };
}

describe("histórico operacional de ServiceOrder", () => {
  it("registra criação e edições reais sem persistir conteúdo sensível", async () => {
    const { admin, session, order } = await createOrderThroughApi();

    const edited = await request(app)
      .patch(`/service-orders/${order.id}`)
      .set("Cookie", session.cookie)
      .set("x-csrf-token", session.csrfHeader)
      .send({
        title: "Falha operacional revisada",
        description: "Descrição interna que não deve ir para o evento",
        priority: "HIGH",
      });
    expect(edited.status).toBe(200);

    const unchanged = await request(app)
      .patch(`/service-orders/${order.id}`)
      .set("Cookie", session.cookie)
      .set("x-csrf-token", session.csrfHeader)
      .send({ title: "Falha operacional revisada" });
    expect(unchanged.status).toBe(200);

    const events = await testPrisma.serviceOrderEvent.findMany({
      where: { serviceOrderId: order.id },
      orderBy: { createdAt: "asc" },
    });
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({ type: "CREATED", actorId: admin.id, newStatus: "OPEN" });
    expect(events[1]).toMatchObject({
      type: "OPERATIONAL_UPDATED",
      actorId: admin.id,
      changedFields: ["title", "description", "priority"],
      previousPriority: "MEDIUM",
      newPriority: "HIGH",
    });
    expect(JSON.stringify(events[1])).not.toContain("Descrição interna");
    expect(JSON.stringify(events[1])).not.toContain("Falha operacional revisada");
  });

  it("registra status, atribuição, reatribuição e remoção em ordem consistente", async () => {
    const { session, order } = await createOrderThroughApi();
    const { user: technicianA } = await createFixtureUser("TECHNICIAN");
    const { user: technicianB } = await createFixtureUser("TECHNICIAN");

    for (const technicianId of [technicianA.id, technicianB.id, null]) {
      const response = await request(app)
        .patch(`/service-orders/${order.id}/technician`)
        .set("Cookie", session.cookie)
        .set("x-csrf-token", session.csrfHeader)
        .send({ technicianId });
      expect(response.status).toBe(200);
    }
    const status = await request(app)
      .patch(`/service-orders/${order.id}/status`)
      .set("Cookie", session.cookie)
      .set("x-csrf-token", session.csrfHeader)
      .send({ status: "IN_PROGRESS" });
    expect(status.status).toBe(200);

    const response = await request(app)
      .get(`/service-orders/${order.id}/events`)
      .set("Cookie", session.cookie);
    expect(response.status).toBe(200);
    expect(response.body.map((event: { type: string }) => event.type)).toEqual([
      "CREATED",
      "TECHNICIAN_ASSIGNED",
      "TECHNICIAN_REASSIGNED",
      "TECHNICIAN_UNASSIGNED",
      "STATUS_CHANGED",
    ]);
    expect(response.body[1].newTechnician).toEqual({ id: technicianA.id, name: technicianA.name });
    expect(response.body[2].previousTechnician.id).toBe(technicianA.id);
    expect(response.body[2].newTechnician.id).toBe(technicianB.id);
    expect(response.body[4]).toMatchObject({ previousStatus: "OPEN", newStatus: "IN_PROGRESS" });
    expect(response.body.every((event: { createdAt: string }, index: number, all: Array<{ createdAt: string }>) =>
      index === 0 || new Date(all[index - 1].createdAt) <= new Date(event.createdAt))).toBe(true);
  });

  it("não registra tentativas inválidas nem eventos falsos em conflitos concorrentes", async () => {
    const { session, order } = await createOrderThroughApi();
    const { user: technicianA } = await createFixtureUser("TECHNICIAN");
    const { user: technicianB } = await createFixtureUser("TECHNICIAN");

    const invalid = await request(app)
      .patch(`/service-orders/${order.id}/status`)
      .set("Cookie", session.cookie)
      .set("x-csrf-token", session.csrfHeader)
      .send({ status: "COMPLETED" });
    expect(invalid.status).toBe(409);

    const responses = await Promise.all([technicianA.id, technicianB.id].map((technicianId) =>
      request(app)
        .patch(`/service-orders/${order.id}/technician`)
        .set("Cookie", session.cookie)
        .set("x-csrf-token", session.csrfHeader)
        .send({ technicianId }),
    ));
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(await testPrisma.serviceOrderEvent.count({
      where: { serviceOrderId: order.id, type: "TECHNICIAN_ASSIGNED" },
    })).toBe(1);
    expect(await testPrisma.serviceOrderEvent.count({
      where: { serviceOrderId: order.id, type: "STATUS_CHANGED" },
    })).toBe(0);
  });

  it("reverte a alteração operacional quando a gravação do evento falha", async () => {
    const { session, order } = await createOrderThroughApi();
    await testPrisma.$executeRawUnsafe(`
      CREATE FUNCTION test_reject_service_order_event() RETURNS trigger AS $$
      BEGIN
        IF NEW.type = 'OPERATIONAL_UPDATED' THEN
          RAISE EXCEPTION 'forced event failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER test_reject_service_order_event_trigger
      BEFORE INSERT ON "ServiceOrderEvent"
      FOR EACH ROW EXECUTE FUNCTION test_reject_service_order_event();
    `);

    try {
      const response = await request(app)
        .patch(`/service-orders/${order.id}`)
        .set("Cookie", session.cookie)
        .set("x-csrf-token", session.csrfHeader)
        .send({ title: "Esta alteração deve ser revertida" });
      expect(response.status).toBe(500);
      expect((await testPrisma.serviceOrder.findUniqueOrThrow({ where: { id: order.id } })).title)
        .toBe("Falha operacional");
      expect(await testPrisma.serviceOrderEvent.count({ where: { serviceOrderId: order.id } })).toBe(1);
    } finally {
      await testPrisma.$executeRawUnsafe(`
        DROP TRIGGER IF EXISTS test_reject_service_order_event_trigger ON "ServiceOrderEvent";
        DROP FUNCTION IF EXISTS test_reject_service_order_event();
      `);
    }
  });

  it("aplica escopo interno e filtra a projeção pertencente ao cliente", async () => {
    const { customer, session, order } = await createOrderThroughApi();
    const otherCustomer = await createFixtureCustomer();
    const { user: portalTechnician } = await createFixtureUser("TECHNICIAN");
    const { user: otherTechnician } = await createFixtureUser("TECHNICIAN");
    const otherOrder = await createFixtureServiceOrder({
      customerId: otherCustomer.id,
      createdById: (await createFixtureUser("ATTENDANT")).user.id,
      technicianId: otherTechnician.id,
    });

    await request(app).patch(`/service-orders/${order.id}`)
      .set("Cookie", session.cookie).set("x-csrf-token", session.csrfHeader)
      .send({ title: "Edição interna" });
    await request(app).patch(`/service-orders/${order.id}/technician`)
      .set("Cookie", session.cookie).set("x-csrf-token", session.csrfHeader)
      .send({ technicianId: portalTechnician.id });
    await request(app).patch(`/service-orders/${order.id}/status`)
      .set("Cookie", session.cookie).set("x-csrf-token", session.csrfHeader)
      .send({ status: "IN_PROGRESS" });

    const ownerCookie = await customerCookie(customer.id, "timeline-owner@example.com");
    const otherCookie = await customerCookie(otherCustomer.id, "timeline-other@example.com");
    const owner = await request(app)
      .get(`/auth/customer/service-orders/${order.id}/events`)
      .set("Cookie", ownerCookie);
    expect(owner.status).toBe(200);
    expect(owner.body.map((event: { type: string }) => event.type)).toEqual([
      "CREATED",
      "TECHNICIAN_ASSIGNED",
      "STATUS_CHANGED",
    ]);
    expect(owner.body[1].technicianName).toBe(portalTechnician.name);
    expect(JSON.stringify(owner.body)).not.toContain("OPERATIONAL_UPDATED");
    expect(JSON.stringify(owner.body)).not.toContain("actorId");
    expect(JSON.stringify(owner.body)).not.toContain("changedFields");
    expect(JSON.stringify(owner.body)).not.toContain(portalTechnician.id);
    expect((await request(app)
      .get(`/auth/customer/service-orders/${otherOrder.id}/events`)
      .set("Cookie", ownerCookie)).status).toBe(404);
    expect((await request(app)
      .get(`/auth/customer/service-orders/${order.id}/events`)
      .set("Cookie", otherCookie)).status).toBe(404);

    const technicianSession = await loginAs(app, otherTechnician.email, FIXTURE_PASSWORD);
    expect((await request(app)
      .get(`/service-orders/${order.id}/events`)
      .set("Cookie", technicianSession.cookie)).status).toBe(404);
  });

  it("preserva o histórico quando o cliente é anonimizado", async () => {
    const { customer, session, order } = await createOrderThroughApi();
    const anonymized = await request(app)
      .post(`/customers/${customer.id}/anonymize`)
      .set("Cookie", session.cookie)
      .set("x-csrf-token", session.csrfHeader);
    expect(anonymized.status).toBe(200);
    expect(await testPrisma.serviceOrderEvent.count({ where: { serviceOrderId: order.id } })).toBe(1);
    const timeline = await request(app)
      .get(`/service-orders/${order.id}/events`)
      .set("Cookie", session.cookie);
    expect(timeline.status).toBe(200);
    expect(timeline.body[0].type).toBe("CREATED");
  });

  it("preserva o evento e remove a referência ao ator quando o usuário é excluído", async () => {
    const { session, order } = await createOrderThroughApi();
    const { user: attendant } = await createFixtureUser("ATTENDANT");
    const attendantSession = await loginAs(app, attendant.email, FIXTURE_PASSWORD);
    const edited = await request(app)
      .patch(`/service-orders/${order.id}`)
      .set("Cookie", attendantSession.cookie)
      .set("x-csrf-token", attendantSession.csrfHeader)
      .send({ priority: "URGENT" });
    expect(edited.status).toBe(200);

    await testPrisma.user.delete({ where: { id: attendant.id } });
    const stored = await testPrisma.serviceOrderEvent.findFirstOrThrow({
      where: { serviceOrderId: order.id, type: "OPERATIONAL_UPDATED" },
    });
    expect(stored.actorId).toBeNull();

    const timeline = await request(app)
      .get(`/service-orders/${order.id}/events`)
      .set("Cookie", session.cookie);
    expect(timeline.status).toBe(200);
    expect(timeline.body.find((event: { type: string }) => event.type === "OPERATIONAL_UPDATED").actor)
      .toBeNull();
  });
});
