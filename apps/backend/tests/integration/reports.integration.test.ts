import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";

import app from "../../src/app.js";
import {
  createFixtureCustomer,
  createFixtureUser,
  FIXTURE_PASSWORD,
} from "../helpers/fixtures.js";
import { loginAs } from "../helpers/integration-auth.js";
import { resetDatabase, testPrisma } from "../helpers/test-db.js";

beforeEach(async () => {
  await resetDatabase();
});

async function createOrder(params: {
  customerId: string;
  createdById: string;
  createdAt: string;
  status: "OPEN" | "IN_PROGRESS" | "WAITING" | "COMPLETED" | "CANCELLED";
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  technicianId?: string | null;
  title: string;
}) {
  return testPrisma.serviceOrder.create({
    data: {
      title: params.title,
      description: "Ordem preparada para o relatório operacional.",
      status: params.status,
      priority: params.priority,
      customerId: params.customerId,
      createdById: params.createdById,
      technicianId: params.technicianId ?? null,
      createdAt: new Date(params.createdAt),
    },
  });
}

async function prepareReportScenario() {
  const { user: admin } = await createFixtureUser("ADMIN");
  const { user: attendant } = await createFixtureUser("ATTENDANT");
  const { user: technicianA } = await createFixtureUser("TECHNICIAN");
  const { user: technicianB } = await createFixtureUser("TECHNICIAN");
  const customer = await createFixtureCustomer({
    name: "Cliente que não pode aparecer no relatório",
    email: "pii-relatorio@example.com",
  });

  const open = await createOrder({
    customerId: customer.id,
    createdById: admin.id,
    technicianId: technicianA.id,
    title: "Aberta no limite inicial",
    status: "OPEN",
    priority: "HIGH",
    createdAt: "2026-10-01T03:00:00.000Z",
  });
  await createOrder({
    customerId: customer.id,
    createdById: admin.id,
    technicianId: technicianA.id,
    title: "Em andamento no período",
    status: "IN_PROGRESS",
    priority: "MEDIUM",
    createdAt: "2026-10-02T15:00:00.000Z",
  });
  await createOrder({
    customerId: customer.id,
    createdById: attendant.id,
    title: "Aguardando sem técnico",
    status: "WAITING",
    priority: "LOW",
    createdAt: "2026-10-03T12:00:00.000Z",
  });
  const completedAtEnd = await createOrder({
    customerId: customer.id,
    createdById: attendant.id,
    technicianId: technicianB.id,
    title: "Concluída no limite final",
    status: "COMPLETED",
    priority: "URGENT",
    createdAt: "2026-10-04T02:59:59.000Z",
  });
  await createOrder({
    customerId: customer.id,
    createdById: admin.id,
    title: "Concluída legada sem evento",
    status: "COMPLETED",
    priority: "LOW",
    createdAt: "2026-10-02T16:00:00.000Z",
  });
  const completedOlderOrder = await createOrder({
    customerId: customer.id,
    createdById: admin.id,
    title: "Criada antes e concluída no período",
    status: "COMPLETED",
    priority: "HIGH",
    createdAt: "2026-09-10T12:00:00.000Z",
  });
  const outside = await createOrder({
    customerId: customer.id,
    createdById: admin.id,
    title: "Fora do limite final",
    status: "COMPLETED",
    priority: "HIGH",
    createdAt: "2026-10-04T03:00:00.000Z",
  });

  await testPrisma.serviceOrderEvent.createMany({
    data: [
      {
        serviceOrderId: completedOlderOrder.id,
        actorId: admin.id,
        type: "STATUS_CHANGED",
        previousStatus: "IN_PROGRESS",
        newStatus: "COMPLETED",
        createdAt: new Date("2026-10-02T18:00:00.000Z"),
      },
      {
        serviceOrderId: completedAtEnd.id,
        actorId: admin.id,
        type: "STATUS_CHANGED",
        previousStatus: "IN_PROGRESS",
        newStatus: "COMPLETED",
        createdAt: new Date("2026-10-04T02:59:59.000Z"),
      },
      {
        serviceOrderId: outside.id,
        actorId: admin.id,
        type: "STATUS_CHANGED",
        previousStatus: "IN_PROGRESS",
        newStatus: "COMPLETED",
        createdAt: new Date("2026-10-04T03:00:00.000Z"),
      },
    ],
  });

  return { admin, attendant, technicianA, customer, open };
}

describe("relatórios operacionais", () => {
  it("agrega status, prioridade, criação, conclusão real e carga atual nos limites de Brasília", async () => {
    const { admin, technicianA } = await prepareReportScenario();
    const session = await loginAs(app, admin.email, FIXTURE_PASSWORD);
    const response = await request(app)
      .get("/reports/operations")
      .query({ startDate: "2026-10-01", endDate: "2026-10-03" })
      .set("Cookie", session.cookie);

    expect(response.status).toBe(200);
    expect(response.body.period).toEqual({
      startDate: "2026-10-01",
      endDate: "2026-10-03",
      timeZone: "America/Sao_Paulo",
      endDateInclusive: true,
    });
    expect(response.body.currentDistribution.total).toBe(5);
    expect(Object.fromEntries(response.body.currentDistribution.byStatus.map(
      (item: { status: string; count: number }) => [item.status, item.count],
    ))).toEqual({ OPEN: 1, IN_PROGRESS: 1, WAITING: 1, COMPLETED: 2, CANCELLED: 0 });
    expect(Object.fromEntries(response.body.currentDistribution.byPriority.map(
      (item: { priority: string; count: number }) => [item.priority, item.count],
    ))).toEqual({ LOW: 2, MEDIUM: 1, HIGH: 1, URGENT: 1 });
    expect(response.body.activity.createdTotal).toBe(5);
    expect(response.body.activity.completedTotal).toBe(2);
    expect(response.body.activity.daily).toEqual([
      { date: "2026-10-01", created: 1, completed: 0 },
      { date: "2026-10-02", created: 2, completed: 1 },
      { date: "2026-10-03", created: 2, completed: 1 },
    ]);
    expect(response.body.workload).toEqual(expect.arrayContaining([
      {
        technician: { id: technicianA.id, name: technicianA.name },
        total: 2,
        byStatus: { OPEN: 1, IN_PROGRESS: 1, WAITING: 0 },
      },
      {
        technician: null,
        total: 1,
        byStatus: { OPEN: 0, IN_PROGRESS: 0, WAITING: 1 },
      },
    ]));
    expect(response.body.completionHistory).toMatchObject({
      source: "SERVICE_ORDER_EVENT",
      legacyCoverageLimited: true,
    });
  });

  it("combina status e prioridade atuais sem transformar updatedAt em conclusão", async () => {
    const { admin, open } = await prepareReportScenario();
    const session = await loginAs(app, admin.email, FIXTURE_PASSWORD);
    const response = await request(app)
      .get("/reports/operations")
      .query({
        startDate: "2026-10-01",
        endDate: "2026-10-03",
        status: "OPEN",
        priority: "HIGH",
      })
      .set("Cookie", session.cookie);

    expect(response.status).toBe(200);
    expect(response.body.currentDistribution.total).toBe(1);
    expect(response.body.activity.createdTotal).toBe(1);
    expect(response.body.activity.completedTotal).toBe(0);
    expect(response.body.workload).toHaveLength(1);
    expect(response.body.workload[0].byStatus.OPEN).toBe(1);
    expect(response.body).not.toHaveProperty("orders");
    expect(JSON.stringify(response.body)).not.toContain(open.title);
  });

  it("retorna séries zeradas para período vazio e rejeita datas e limites inválidos em pt-BR", async () => {
    const { admin } = await prepareReportScenario();
    const session = await loginAs(app, admin.email, FIXTURE_PASSWORD);
    const empty = await request(app)
      .get("/reports/operations")
      .query({ startDate: "2020-01-01", endDate: "2020-01-02" })
      .set("Cookie", session.cookie);
    expect(empty.status).toBe(200);
    expect(empty.body.currentDistribution.total).toBe(0);
    expect(empty.body.activity).toMatchObject({
      createdTotal: 0,
      completedTotal: 0,
      daily: [
        { date: "2020-01-01", created: 0, completed: 0 },
        { date: "2020-01-02", created: 0, completed: 0 },
      ],
    });
    expect(empty.body.workload).toEqual([]);

    for (const query of [
      { startDate: "2026-10-03", endDate: "2026-10-01" },
      { startDate: "2026-02-30", endDate: "2026-03-01" },
      { startDate: "2026-10-01" },
      { startDate: "2025-01-01", endDate: "2026-01-02" },
      { startDate: "2026-10-01", endDate: "2026-10-03", status: "INVALID" },
    ]) {
      const invalid = await request(app)
        .get("/reports/operations")
        .query(query)
        .set("Cookie", session.cookie);
      expect(invalid.status).toBe(400);
      expect(invalid.body.error).toBe("Filtros inválidos");
    }
  });

  it("autoriza ADMIN e ATTENDANT, bloqueia TECHNICIAN e não retorna PII de cliente", async () => {
    const { admin, attendant, technicianA, customer } = await prepareReportScenario();
    const adminSession = await loginAs(app, admin.email, FIXTURE_PASSWORD);
    const attendantSession = await loginAs(app, attendant.email, FIXTURE_PASSWORD);
    const technicianSession = await loginAs(app, technicianA.email, FIXTURE_PASSWORD);
    const query = { startDate: "2026-10-01", endDate: "2026-10-03" };

    const adminResponse = await request(app)
      .get("/reports/operations").query(query).set("Cookie", adminSession.cookie);
    const attendantResponse = await request(app)
      .get("/reports/operations").query(query).set("Cookie", attendantSession.cookie);
    const technicianResponse = await request(app)
      .get("/reports/operations").query(query).set("Cookie", technicianSession.cookie);
    const unauthenticated = await request(app).get("/reports/operations").query(query);

    expect(adminResponse.status).toBe(200);
    expect(attendantResponse.status).toBe(200);
    expect(technicianResponse.status).toBe(403);
    expect(unauthenticated.status).toBe(401);
    const serialized = JSON.stringify(adminResponse.body);
    expect(serialized).not.toContain(customer.name);
    expect(serialized).not.toContain(customer.email);
    expect(serialized).not.toContain("customerId");
  });
});
