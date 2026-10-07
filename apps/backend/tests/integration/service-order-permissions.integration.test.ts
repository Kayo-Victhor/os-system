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

const CUSTOMER_PASSWORD = "customer-password-123";

beforeEach(async () => {
  await resetDatabase();
});

async function createCustomerAccess(customerId: string, email: string) {
  await testPrisma.customerAccount.create({
    data: {
      customerId,
      email,
      passwordHash: await hashPassword(CUSTOMER_PASSWORD),
      emailVerifiedAt: new Date(),
      status: "ACTIVE",
    },
  });

  const response = await request(app)
    .post("/auth/customer/login")
    .send({ email, password: CUSTOMER_PASSWORD });
  expect(response.status).toBe(200);
  const cookies = response.headers["set-cookie"] as unknown as string[];
  return cookies.map((cookie) => cookie.split(";")[0]).join("; ");
}

describe("matriz de permissões de ServiceOrder", () => {
  it("deriva createdById e permite criação somente para ADMIN e ATTENDANT", async () => {
    const { user: admin } = await createFixtureUser("ADMIN");
    const { user: attendant } = await createFixtureUser("ATTENDANT");
    const { user: technician } = await createFixtureUser("TECHNICIAN");
    const customer = await createFixtureCustomer();
    const customerCookie = await createCustomerAccess(customer.id, "matrix-create@example.com");
    const adminSession = await loginAs(app, admin.email, FIXTURE_PASSWORD);
    const attendantSession = await loginAs(app, attendant.email, FIXTURE_PASSWORD);
    const technicianSession = await loginAs(app, technician.email, FIXTURE_PASSWORD);
    const payload = {
      title: "Validar equipamento",
      description: "Equipamento precisa de diagnóstico",
      priority: "HIGH",
      customerId: customer.id,
    };

    const adminCreate = await request(app).post("/service-orders")
      .set("Cookie", adminSession.cookie).set("x-csrf-token", adminSession.csrfHeader)
      .send(payload);
    const attendantCreate = await request(app).post("/service-orders")
      .set("Cookie", attendantSession.cookie).set("x-csrf-token", attendantSession.csrfHeader)
      .send(payload);
    const technicianCreate = await request(app).post("/service-orders")
      .set("Cookie", technicianSession.cookie).set("x-csrf-token", technicianSession.csrfHeader)
      .send(payload);
    const customerCreate = await request(app).post("/service-orders")
      .set("Cookie", customerCookie).send(payload);

    expect(adminCreate.status).toBe(201);
    expect(attendantCreate.status).toBe(201);
    expect(technicianCreate.status).toBe(403);
    expect(customerCreate.status).toBe(401);
    expect(adminCreate.body.createdById).toBe(admin.id);
    expect(attendantCreate.body.createdById).toBe(attendant.id);
    expect(adminCreate.body.status).toBe("OPEN");
    expect(attendantCreate.body.status).toBe("OPEN");
  });

  it("rejeita mass assignment na criação sem persistir a ordem", async () => {
    const { user: attendant } = await createFixtureUser("ATTENDANT");
    const { user: otherUser } = await createFixtureUser("ADMIN");
    const { user: technician } = await createFixtureUser("TECHNICIAN");
    const customer = await createFixtureCustomer();
    const session = await loginAs(app, attendant.email, FIXTURE_PASSWORD);

    const response = await request(app).post("/service-orders")
      .set("Cookie", session.cookie).set("x-csrf-token", session.csrfHeader)
      .send({
        title: "Tentativa de falsificação",
        description: "Payload contém campos controlados pelo servidor",
        customerId: customer.id,
        createdById: otherUser.id,
        technicianId: technician.id,
        status: "COMPLETED",
        role: "ADMIN",
      });

    expect(response.status).toBe(400);
    expect(await testPrisma.serviceOrder.count()).toBe(0);
  });

  it("aplica escopos diferentes para equipe, técnico e CustomerAccount", async () => {
    const { user: admin } = await createFixtureUser("ADMIN");
    const { user: attendant } = await createFixtureUser("ATTENDANT");
    const { user: techA } = await createFixtureUser("TECHNICIAN");
    const { user: techB } = await createFixtureUser("TECHNICIAN");
    const customerA = await createFixtureCustomer();
    const customerB = await createFixtureCustomer();
    const orderA = await createFixtureServiceOrder({ customerId: customerA.id, createdById: attendant.id, technicianId: techA.id });
    const orderB = await createFixtureServiceOrder({ customerId: customerB.id, createdById: admin.id, technicianId: techB.id });
    const unassigned = await createFixtureServiceOrder({ customerId: customerB.id, createdById: admin.id });
    const adminSession = await loginAs(app, admin.email, FIXTURE_PASSWORD);
    const attendantSession = await loginAs(app, attendant.email, FIXTURE_PASSWORD);
    const techSession = await loginAs(app, techA.email, FIXTURE_PASSWORD);
    const customerCookie = await createCustomerAccess(customerA.id, "owner-a@example.com");

    expect((await request(app).get("/service-orders").set("Cookie", adminSession.cookie)).body).toHaveLength(3);
    expect((await request(app).get("/service-orders").set("Cookie", attendantSession.cookie)).body).toHaveLength(3);

    const techList = await request(app).get("/service-orders")
      .query({ technicianId: techB.id }).set("Cookie", techSession.cookie);
    expect(techList.status).toBe(200);
    expect(techList.body.map((order: { id: string }) => order.id)).toEqual([orderA.id]);
    expect((await request(app).get(`/service-orders/${orderA.id}`).set("Cookie", techSession.cookie)).status).toBe(200);
    expect((await request(app).get(`/service-orders/${orderB.id}`).set("Cookie", techSession.cookie)).status).toBe(404);
    expect((await request(app).get(`/service-orders/${unassigned.id}`).set("Cookie", techSession.cookie)).status).toBe(404);

    const customerList = await request(app).get("/auth/customer/service-orders").set("Cookie", customerCookie);
    expect(customerList.status).toBe(200);
    expect(customerList.body.map((order: { id: string }) => order.id)).toEqual([orderA.id]);
    expect((await request(app).get(`/auth/customer/service-orders/${orderB.id}`).set("Cookie", customerCookie)).status).toBe(404);
    expect((await request(app).get("/service-orders").set("Cookie", customerCookie)).status).toBe(401);
  });

  it("permite edição e prioridade a ADMIN/ATTENDANT e rejeita campos imutáveis", async () => {
    const { user: admin } = await createFixtureUser("ADMIN");
    const { user: attendant } = await createFixtureUser("ATTENDANT");
    const { user: technician } = await createFixtureUser("TECHNICIAN");
    const customer = await createFixtureCustomer();
    const otherCustomer = await createFixtureCustomer();
    const order = await createFixtureServiceOrder({ customerId: customer.id, createdById: admin.id });
    const adminSession = await loginAs(app, admin.email, FIXTURE_PASSWORD);
    const attendantSession = await loginAs(app, attendant.email, FIXTURE_PASSWORD);
    const techSession = await loginAs(app, technician.email, FIXTURE_PASSWORD);

    const adminEdit = await request(app).patch(`/service-orders/${order.id}`)
      .set("Cookie", adminSession.cookie).set("x-csrf-token", adminSession.csrfHeader)
      .send({ title: "Título administrativo" });
    const attendantEdit = await request(app).patch(`/service-orders/${order.id}`)
      .set("Cookie", attendantSession.cookie).set("x-csrf-token", attendantSession.csrfHeader)
      .send({ priority: "URGENT" });
    const techEdit = await request(app).patch(`/service-orders/${order.id}`)
      .set("Cookie", techSession.cookie).set("x-csrf-token", techSession.csrfHeader)
      .send({ priority: "LOW" });
    const tampering = await request(app).patch(`/service-orders/${order.id}`)
      .set("Cookie", attendantSession.cookie).set("x-csrf-token", attendantSession.csrfHeader)
      .send({ customerId: otherCustomer.id, createdById: attendant.id, technicianId: technician.id, status: "COMPLETED" });

    expect(adminEdit.status).toBe(200);
    expect(attendantEdit.status).toBe(200);
    expect(techEdit.status).toBe(403);
    expect(tampering.status).toBe(400);
    const stored = await testPrisma.serviceOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(stored.customerId).toBe(customer.id);
    expect(stored.createdById).toBe(admin.id);
    expect(stored.technicianId).toBeNull();
    expect(stored.status).toBe("OPEN");
    expect(stored.priority).toBe("URGENT");
  });

  it("permite atribuição a ADMIN/ATTENDANT somente para User TECHNICIAN", async () => {
    const { user: admin } = await createFixtureUser("ADMIN");
    const { user: attendant } = await createFixtureUser("ATTENDANT");
    const { user: techA } = await createFixtureUser("TECHNICIAN");
    const { user: techB } = await createFixtureUser("TECHNICIAN");
    const customer = await createFixtureCustomer();
    const order = await createFixtureServiceOrder({ customerId: customer.id, createdById: admin.id });
    const adminSession = await loginAs(app, admin.email, FIXTURE_PASSWORD);
    const attendantSession = await loginAs(app, attendant.email, FIXTURE_PASSWORD);
    const techSession = await loginAs(app, techA.email, FIXTURE_PASSWORD);

    const assigned = await request(app).patch(`/service-orders/${order.id}/technician`)
      .set("Cookie", adminSession.cookie).set("x-csrf-token", adminSession.csrfHeader)
      .send({ technicianId: techA.id });
    const reassigned = await request(app).patch(`/service-orders/${order.id}/technician`)
      .set("Cookie", attendantSession.cookie).set("x-csrf-token", attendantSession.csrfHeader)
      .send({ technicianId: techB.id });
    const invalidRole = await request(app).patch(`/service-orders/${order.id}/technician`)
      .set("Cookie", attendantSession.cookie).set("x-csrf-token", attendantSession.csrfHeader)
      .send({ technicianId: attendant.id });
    const technicianAttempt = await request(app).patch(`/service-orders/${order.id}/technician`)
      .set("Cookie", techSession.cookie).set("x-csrf-token", techSession.csrfHeader)
      .send({ technicianId: techA.id });

    expect(assigned.status).toBe(200);
    expect(reassigned.status).toBe(200);
    expect(invalidRole.status).toBe(400);
    expect(technicianAttempt.status).toBe(403);
    expect((await testPrisma.serviceOrder.findUniqueOrThrow({ where: { id: order.id } })).technicianId).toBe(techB.id);

    const candidates = await request(app).get("/service-orders/technicians").set("Cookie", attendantSession.cookie);
    expect(candidates.status).toBe(200);
    expect(candidates.body).toEqual(expect.arrayContaining([
      { id: techA.id, name: techA.name },
      { id: techB.id, name: techB.name },
    ]));
    expect(candidates.body.every((candidate: Record<string, unknown>) => Object.keys(candidate).sort().join(",") === "id,name")).toBe(true);
  });

  it("aplica a máquina de estados e regras diferentes para ADMIN e TECHNICIAN", async () => {
    const { user: admin } = await createFixtureUser("ADMIN");
    const { user: attendant } = await createFixtureUser("ATTENDANT");
    const { user: technician } = await createFixtureUser("TECHNICIAN");
    const customer = await createFixtureCustomer();
    const adminOrder = await createFixtureServiceOrder({ customerId: customer.id, createdById: admin.id });
    const techOrder = await createFixtureServiceOrder({ customerId: customer.id, createdById: admin.id, technicianId: technician.id });
    const cancelAttemptOrder = await createFixtureServiceOrder({ customerId: customer.id, createdById: admin.id, technicianId: technician.id });
    const adminSession = await loginAs(app, admin.email, FIXTURE_PASSWORD);
    const attendantSession = await loginAs(app, attendant.email, FIXTURE_PASSWORD);
    const techSession = await loginAs(app, technician.email, FIXTURE_PASSWORD);

    for (const status of ["IN_PROGRESS", "WAITING", "CANCELLED"] as const) {
      const response = await request(app).patch(`/service-orders/${adminOrder.id}/status`)
        .set("Cookie", adminSession.cookie).set("x-csrf-token", adminSession.csrfHeader)
        .send({ status });
      expect(response.status).toBe(200);
    }
    expect((await request(app).patch(`/service-orders/${adminOrder.id}/status`)
      .set("Cookie", adminSession.cookie).set("x-csrf-token", adminSession.csrfHeader)
      .send({ status: "IN_PROGRESS" })).status).toBe(409);

    for (const status of ["IN_PROGRESS", "WAITING", "IN_PROGRESS", "COMPLETED"] as const) {
      const response = await request(app).patch(`/service-orders/${techOrder.id}/status`)
        .set("Cookie", techSession.cookie).set("x-csrf-token", techSession.csrfHeader)
        .send({ status });
      expect(response.status).toBe(200);
    }
    expect((await request(app).patch(`/service-orders/${cancelAttemptOrder.id}/status`)
      .set("Cookie", techSession.cookie).set("x-csrf-token", techSession.csrfHeader)
      .send({ status: "CANCELLED" })).status).toBe(403);
    expect((await request(app).patch(`/service-orders/${cancelAttemptOrder.id}/status`)
      .set("Cookie", attendantSession.cookie).set("x-csrf-token", attendantSession.csrfHeader)
      .send({ status: "IN_PROGRESS" })).status).toBe(403);
  });

  it("mantém DELETE exclusivo de ADMIN", async () => {
    const { user: admin } = await createFixtureUser("ADMIN");
    const { user: attendant } = await createFixtureUser("ATTENDANT");
    const { user: technician } = await createFixtureUser("TECHNICIAN");
    const customer = await createFixtureCustomer();
    const order = await createFixtureServiceOrder({ customerId: customer.id, createdById: admin.id });
    const customerCookie = await createCustomerAccess(customer.id, "delete-owner@example.com");
    const adminSession = await loginAs(app, admin.email, FIXTURE_PASSWORD);
    const attendantSession = await loginAs(app, attendant.email, FIXTURE_PASSWORD);
    const techSession = await loginAs(app, technician.email, FIXTURE_PASSWORD);

    expect((await request(app).delete(`/service-orders/${order.id}`)
      .set("Cookie", attendantSession.cookie).set("x-csrf-token", attendantSession.csrfHeader)).status).toBe(403);
    expect((await request(app).delete(`/service-orders/${order.id}`)
      .set("Cookie", techSession.cookie).set("x-csrf-token", techSession.csrfHeader)).status).toBe(403);
    expect((await request(app).delete(`/service-orders/${order.id}`).set("Cookie", customerCookie)).status).toBe(401);
    expect((await request(app).delete(`/service-orders/${order.id}`)
      .set("Cookie", adminSession.cookie).set("x-csrf-token", adminSession.csrfHeader)).status).toBe(204);
  });

  it("não expõe e-mail/role internos nem documento do cliente ao TECHNICIAN", async () => {
    const { user: admin } = await createFixtureUser("ADMIN");
    const { user: technician } = await createFixtureUser("TECHNICIAN");
    const customer = await createFixtureCustomer({ document: "sensitive-document" });
    const order = await createFixtureServiceOrder({ customerId: customer.id, createdById: admin.id, technicianId: technician.id });
    const session = await loginAs(app, technician.email, FIXTURE_PASSWORD);

    const response = await request(app).get(`/service-orders/${order.id}`).set("Cookie", session.cookie);
    expect(response.status).toBe(200);
    expect(response.body.createdBy).toEqual({ id: admin.id, name: admin.name });
    expect(response.body.technician).toEqual({ id: technician.id, name: technician.name });
    expect(response.body.customer.document).toBeUndefined();
  });
});

describe("concorrência de ServiceOrder", () => {
  it("aceita somente uma entre duas atribuições concorrentes", async () => {
    const { user: admin } = await createFixtureUser("ADMIN");
    const { user: techA } = await createFixtureUser("TECHNICIAN");
    const { user: techB } = await createFixtureUser("TECHNICIAN");
    const customer = await createFixtureCustomer();
    const order = await createFixtureServiceOrder({ customerId: customer.id, createdById: admin.id });
    const session = await loginAs(app, admin.email, FIXTURE_PASSWORD);

    const responses = await Promise.all([techA.id, techB.id].map((technicianId) =>
      request(app).patch(`/service-orders/${order.id}/technician`)
        .set("Cookie", session.cookie).set("x-csrf-token", session.csrfHeader)
        .send({ technicianId }),
    ));

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect([techA.id, techB.id]).toContain(
      (await testPrisma.serviceOrder.findUniqueOrThrow({ where: { id: order.id } })).technicianId,
    );
  });

  it("aceita somente uma entre duas transições concorrentes", async () => {
    const { user: admin } = await createFixtureUser("ADMIN");
    const customer = await createFixtureCustomer();
    const order = await createFixtureServiceOrder({ customerId: customer.id, createdById: admin.id });
    const session = await loginAs(app, admin.email, FIXTURE_PASSWORD);

    const responses = await Promise.all(["IN_PROGRESS", "CANCELLED"].map((status) =>
      request(app).patch(`/service-orders/${order.id}/status`)
        .set("Cookie", session.cookie).set("x-csrf-token", session.csrfHeader)
        .send({ status }),
    ));

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(["IN_PROGRESS", "CANCELLED"]).toContain(
      (await testPrisma.serviceOrder.findUniqueOrThrow({ where: { id: order.id } })).status,
    );
  });

  it("preserva ownership durante atualizações concorrentes de Customer e ordem", async () => {
    const { user: admin } = await createFixtureUser("ADMIN");
    const customer = await createFixtureCustomer();
    const order = await createFixtureServiceOrder({ customerId: customer.id, createdById: admin.id });
    const session = await loginAs(app, admin.email, FIXTURE_PASSWORD);

    const [customerUpdate, orderUpdate] = await Promise.all([
      request(app).patch(`/customers/${customer.id}`)
        .set("Cookie", session.cookie).set("x-csrf-token", session.csrfHeader)
        .send({ name: "Cliente atualizado" }),
      request(app).patch(`/service-orders/${order.id}`)
        .set("Cookie", session.cookie).set("x-csrf-token", session.csrfHeader)
        .send({ title: "Ordem atualizada" }),
    ]);

    expect(customerUpdate.status).toBe(200);
    expect(orderUpdate.status).toBe(200);
    const stored = await testPrisma.serviceOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(stored.customerId).toBe(customer.id);
    expect(stored.createdById).toBe(admin.id);
  });

  it("mantém resultado consistente em DELETE concorrente com leitura", async () => {
    const { user: admin } = await createFixtureUser("ADMIN");
    const customer = await createFixtureCustomer();
    const order = await createFixtureServiceOrder({ customerId: customer.id, createdById: admin.id });
    const session = await loginAs(app, admin.email, FIXTURE_PASSWORD);

    const [deleted, read] = await Promise.all([
      request(app).delete(`/service-orders/${order.id}`)
        .set("Cookie", session.cookie).set("x-csrf-token", session.csrfHeader),
      request(app).get(`/service-orders/${order.id}`).set("Cookie", session.cookie),
    ]);

    expect(deleted.status).toBe(204);
    expect([200, 404]).toContain(read.status);
    expect(await testPrisma.serviceOrder.findUnique({ where: { id: order.id } })).toBeNull();
  });
});
