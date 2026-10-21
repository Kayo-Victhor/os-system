import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";

import app from "../../src/app.js";
import type { ServiceOrderPriority } from "../../src/generated/prisma/client.js";
import { RESOLUTION_SLA_MINUTES } from "../../src/domain/service-order-sla.js";
import { hashPassword } from "../../src/lib/password.js";
import {
  createFixtureCustomer,
  createFixtureServiceOrder,
  createFixtureUser,
  FIXTURE_PASSWORD,
} from "../helpers/fixtures.js";
import { loginAs } from "../helpers/integration-auth.js";
import { resetDatabase, testPrisma } from "../helpers/test-db.js";

beforeEach(async () => {
  await resetDatabase();
});

async function setupInternalAccess(role: "ADMIN" | "ATTENDANT" | "TECHNICIAN" = "ADMIN") {
  const { user } = await createFixtureUser(role);
  const session = await loginAs(app, user.email, FIXTURE_PASSWORD);
  return { user, session };
}

async function createTrackedOrder(priority: ServiceOrderPriority = "MEDIUM") {
  const { user, session } = await setupInternalAccess();
  const customer = await createFixtureCustomer();
  const response = await request(app)
    .post("/service-orders")
    .set("Cookie", session.cookie)
    .set("x-csrf-token", session.csrfHeader)
    .send({
      title: "Incidente monitorado",
      description: "Falha que deve respeitar o prazo de resolução",
      priority,
      customerId: customer.id,
    });
  expect(response.status).toBe(201);
  return { user, session, customer, response };
}

describe("SLA de resolução de ServiceOrder", () => {
  it("persiste meta e vencimento na criação e os expõe apenas na API interna", async () => {
    const { customer, response } = await createTrackedOrder("HIGH");
    const createdAt = new Date(response.body.createdAt);
    const dueAt = new Date(response.body.resolutionDueAt);

    expect(response.body).toMatchObject({
      resolutionSlaMinutes: 480,
      resolutionSlaStatus: "ON_TRACK",
    });
    expect(dueAt.getTime() - createdAt.getTime()).toBe(480 * 60_000);

    await testPrisma.customerAccount.create({
      data: {
        customerId: customer.id,
        email: "sla-portal@example.com",
        passwordHash: await hashPassword("customer-password-123"),
        emailVerifiedAt: new Date(),
      },
    });
    const login = await request(app).post("/auth/customer/login").send({
      email: "sla-portal@example.com",
      password: "customer-password-123",
    });
    const cookie = (login.headers["set-cookie"] as unknown as string[])
      .map((value) => value.split(";")[0])
      .join("; ");
    const portal = await request(app)
      .get(`/auth/customer/service-orders/${response.body.id}`)
      .set("Cookie", cookie);

    expect(portal.status).toBe(200);
    expect(portal.body.resolutionSlaMinutes).toBeUndefined();
    expect(portal.body.resolutionDueAt).toBeUndefined();
    expect(portal.body.completedAt).toBeUndefined();
    expect(portal.body.resolutionSlaStatus).toBeUndefined();

    const portalList = await request(app)
      .get("/auth/customer/service-orders")
      .set("Cookie", cookie);
    expect(portalList.status).toBe(200);
    expect(portalList.body[0].resolutionSlaMinutes).toBeUndefined();
    expect(portalList.body[0].resolutionDueAt).toBeUndefined();
    expect(portalList.body[0].completedAt).toBeUndefined();
    expect(portalList.body[0].resolutionSlaStatus).toBeUndefined();
  });

  it("recalcula mudança de prioridade a partir da criação sem ativar ordens legadas", async () => {
    const { session, response } = await createTrackedOrder("LOW");
    const originalCreatedAt = new Date("2026-10-01T10:00:00.000Z");
    await testPrisma.serviceOrder.update({
      where: { id: response.body.id },
      data: {
        createdAt: originalCreatedAt,
        resolutionDueAt: new Date(originalCreatedAt.getTime() + 4_320 * 60_000),
      },
    });

    const changed = await request(app)
      .patch(`/service-orders/${response.body.id}`)
      .set("Cookie", session.cookie)
      .set("x-csrf-token", session.csrfHeader)
      .send({ priority: "URGENT" });
    expect(changed.status).toBe(200);
    expect(changed.body.resolutionSlaMinutes).toBe(240);
    expect(new Date(changed.body.resolutionDueAt).getTime())
      .toBe(originalCreatedAt.getTime() + 240 * 60_000);

    const legacy = await createFixtureServiceOrder({
      customerId: response.body.customerId,
      createdById: response.body.createdById,
      priority: "LOW",
    });
    const legacyChanged = await request(app)
      .patch(`/service-orders/${legacy.id}`)
      .set("Cookie", session.cookie)
      .set("x-csrf-token", session.csrfHeader)
      .send({ priority: "HIGH" });
    expect(legacyChanged.status).toBe(200);
    expect(legacyChanged.body).toMatchObject({
      resolutionSlaMinutes: null,
      resolutionDueAt: null,
      resolutionSlaStatus: "UNTRACKED",
    });
  });

  it("classifica conclusão pelo evento e cancelamento sem usar updatedAt", async () => {
    const within = await createTrackedOrder("URGENT");
    await testPrisma.serviceOrder.update({
      where: { id: within.response.body.id },
      data: { resolutionDueAt: new Date(Date.now() + 60 * 60_000) },
    });
    await request(app)
      .patch(`/service-orders/${within.response.body.id}/status`)
      .set("Cookie", within.session.cookie)
      .set("x-csrf-token", within.session.csrfHeader)
      .send({ status: "IN_PROGRESS" });
    const completed = await request(app)
      .patch(`/service-orders/${within.response.body.id}/status`)
      .set("Cookie", within.session.cookie)
      .set("x-csrf-token", within.session.csrfHeader)
      .send({ status: "COMPLETED" });
    expect(completed.status).toBe(200);
    expect(completed.body.resolutionSlaStatus).toBe("MET");

    await testPrisma.serviceOrder.update({
      where: { id: within.response.body.id },
      data: { updatedAt: new Date("2030-01-01T00:00:00.000Z") },
    });
    const reread = await request(app)
      .get(`/service-orders/${within.response.body.id}`)
      .set("Cookie", within.session.cookie);
    expect(reread.body.resolutionSlaStatus).toBe("MET");

    const late = await createTrackedOrder("URGENT");
    await testPrisma.serviceOrder.update({
      where: { id: late.response.body.id },
      data: { resolutionDueAt: new Date(Date.now() - 60_000) },
    });
    await request(app).patch(`/service-orders/${late.response.body.id}/status`)
      .set("Cookie", late.session.cookie).set("x-csrf-token", late.session.csrfHeader)
      .send({ status: "IN_PROGRESS" });
    const breached = await request(app)
      .patch(`/service-orders/${late.response.body.id}/status`)
      .set("Cookie", late.session.cookie)
      .set("x-csrf-token", late.session.csrfHeader)
      .send({ status: "COMPLETED" });
    expect(breached.body.resolutionSlaStatus).toBe("BREACHED");

    const cancelled = await createTrackedOrder("LOW");
    const cancellation = await request(app)
      .patch(`/service-orders/${cancelled.response.body.id}/status`)
      .set("Cookie", cancelled.session.cookie)
      .set("x-csrf-token", cancelled.session.csrfHeader)
      .send({ status: "CANCELLED" });
    expect(cancellation.body.resolutionSlaStatus).toBe("CANCELLED");
  });

  it("mantém SLA, prioridade e histórico atômicos quando o evento falha", async () => {
    const { session, response } = await createTrackedOrder("MEDIUM");
    await testPrisma.$executeRawUnsafe(`
      CREATE FUNCTION test_reject_sla_priority_event() RETURNS trigger AS $$
      BEGIN
        IF NEW.type = 'OPERATIONAL_UPDATED' THEN
          RAISE EXCEPTION 'forced SLA event failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER test_reject_sla_priority_event_trigger
      BEFORE INSERT ON "ServiceOrderEvent"
      FOR EACH ROW EXECUTE FUNCTION test_reject_sla_priority_event();
    `);

    try {
      const failed = await request(app)
        .patch(`/service-orders/${response.body.id}`)
        .set("Cookie", session.cookie)
        .set("x-csrf-token", session.csrfHeader)
        .send({ priority: "URGENT" });
      expect(failed.status).toBe(500);

      const stored = await testPrisma.serviceOrder.findUniqueOrThrow({
        where: { id: response.body.id },
      });
      expect(stored.priority).toBe("MEDIUM");
      expect(stored.resolutionSlaMinutes).toBe(1_440);
      expect(stored.resolutionDueAt?.toISOString()).toBe(response.body.resolutionDueAt);
      expect(await testPrisma.serviceOrderEvent.count({
        where: { serviceOrderId: response.body.id },
      })).toBe(1);
    } finally {
      await testPrisma.$executeRawUnsafe(`
        DROP TRIGGER IF EXISTS test_reject_sla_priority_event_trigger ON "ServiceOrderEvent";
        DROP FUNCTION IF EXISTS test_reject_sla_priority_event();
      `);
    }
  });

  it("não deixa prioridade, meta, prazo e histórico inconsistentes sob concorrência", async () => {
    const { session, response } = await createTrackedOrder("MEDIUM");

    const updates = await Promise.all(["HIGH", "URGENT"].map((priority) =>
      request(app)
        .patch(`/service-orders/${response.body.id}`)
        .set("Cookie", session.cookie)
        .set("x-csrf-token", session.csrfHeader)
        .send({ priority }),
    ));
    expect(updates.every(({ status }) => status === 200 || status === 409)).toBe(true);
    expect(updates.some(({ status }) => status === 200)).toBe(true);

    const stored = await testPrisma.serviceOrder.findUniqueOrThrow({
      where: { id: response.body.id },
    });
    const target = RESOLUTION_SLA_MINUTES[stored.priority];
    expect(stored.resolutionSlaMinutes).toBe(target);
    expect(stored.resolutionDueAt?.getTime())
      .toBe(stored.createdAt.getTime() + target * 60_000);

    const events = await testPrisma.serviceOrderEvent.findMany({
      where: {
        serviceOrderId: response.body.id,
        type: "OPERATIONAL_UPDATED",
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    expect(events.length).toBe(updates.filter(({ status }) => status === 200).length);
    expect(events.at(-1)?.newPriority).toBe(stored.priority);
  });

  it("mantém paginação, filtros e escopo de técnico com a projeção de SLA", async () => {
    const { user: admin, session: adminSession } = await setupInternalAccess();
    const { user: technician, session: technicianSession } = await setupInternalAccess("TECHNICIAN");
    const customer = await createFixtureCustomer();
    const tracked = await request(app).post("/service-orders")
      .set("Cookie", adminSession.cookie).set("x-csrf-token", adminSession.csrfHeader)
      .send({
        title: "Urgência atribuída",
        description: "Ordem para testar filtro e escopo",
        priority: "URGENT",
        customerId: customer.id,
      });
    await request(app).patch(`/service-orders/${tracked.body.id}/technician`)
      .set("Cookie", adminSession.cookie).set("x-csrf-token", adminSession.csrfHeader)
      .send({ technicianId: technician.id });
    await createFixtureServiceOrder({ customerId: customer.id, createdById: admin.id, priority: "LOW" });

    const filtered = await request(app).get("/service-orders")
      .query({ priority: "URGENT", page: 1, limit: 1 })
      .set("Cookie", adminSession.cookie);
    expect(filtered.status).toBe(200);
    expect(filtered.body.pagination).toMatchObject({ page: 1, limit: 1, total: 1 });
    expect(filtered.body.items[0]).toMatchObject({
      id: tracked.body.id,
      resolutionSlaMinutes: 240,
    });

    const technicianView = await request(app)
      .get(`/service-orders/${tracked.body.id}`)
      .set("Cookie", technicianSession.cookie);
    expect(technicianView.status).toBe(200);
    expect(technicianView.body.resolutionSlaMinutes).toBe(240);
  });
});
