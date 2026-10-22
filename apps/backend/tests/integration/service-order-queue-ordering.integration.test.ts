import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";

import app from "../../src/app.js";
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

async function createQueueOrder(params: {
  customerId: string;
  createdById: string;
  technicianId?: string;
  title: string;
  status?: "OPEN" | "IN_PROGRESS" | "WAITING" | "COMPLETED" | "CANCELLED";
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  dueAt?: Date;
  createdAt?: Date;
}) {
  const order = await createFixtureServiceOrder(params);
  if (!params.dueAt && !params.createdAt) return order;

  return testPrisma.serviceOrder.update({
    where: { id: order.id },
    data: {
      ...(params.dueAt
        ? { resolutionSlaMinutes: 480, resolutionDueAt: params.dueAt }
        : {}),
      ...(params.createdAt ? { createdAt: params.createdAt } : {}),
    },
  });
}

describe("GET /service-orders — ordenação da fila por criticidade do SLA", () => {
  it("prioriza vencidas por prioridade, vigentes por prazo e mantém sem SLA e terminais abaixo", async () => {
    const { user: admin } = await createFixtureUser("ADMIN");
    const customer = await createFixtureCustomer();
    const now = Date.now();
    const completed = await createQueueOrder({
      customerId: customer.id,
      createdById: admin.id,
      title: "Concluída crítica",
      status: "COMPLETED",
      priority: "URGENT",
      dueAt: new Date(now - 24 * 60 * 60_000),
    });
    const cancelled = await createQueueOrder({
      customerId: customer.id,
      createdById: admin.id,
      title: "Cancelada crítica",
      status: "CANCELLED",
      priority: "URGENT",
      dueAt: new Date(now - 24 * 60 * 60_000),
    });
    const untracked = await createQueueOrder({
      customerId: customer.id,
      createdById: admin.id,
      title: "Ativa sem SLA",
      status: "OPEN",
      priority: "URGENT",
    });
    const currentFar = await createQueueOrder({
      customerId: customer.id,
      createdById: admin.id,
      title: "Vigente distante urgente",
      status: "WAITING",
      priority: "URGENT",
      dueAt: new Date(now + 120 * 60_000),
    });
    const currentNear = await createQueueOrder({
      customerId: customer.id,
      createdById: admin.id,
      title: "Vigente próxima baixa",
      status: "IN_PROGRESS",
      priority: "LOW",
      dueAt: new Date(now + 30 * 60_000),
    });
    const currentTieLow = await createQueueOrder({
      customerId: customer.id,
      createdById: admin.id,
      title: "Vigente empatada baixa",
      status: "OPEN",
      priority: "LOW",
      dueAt: new Date(now + 60 * 60_000),
    });
    const currentTieUrgent = await createQueueOrder({
      customerId: customer.id,
      createdById: admin.id,
      title: "Vigente empatada urgente",
      status: "WAITING",
      priority: "URGENT",
      dueAt: new Date(now + 60 * 60_000),
    });
    const overdueLow = await createQueueOrder({
      customerId: customer.id,
      createdById: admin.id,
      title: "Vencida antiga baixa",
      status: "OPEN",
      priority: "LOW",
      dueAt: new Date(now - 24 * 60 * 60_000),
    });
    const overdueUrgent = await createQueueOrder({
      customerId: customer.id,
      createdById: admin.id,
      title: "Vencida recente urgente",
      status: "WAITING",
      priority: "URGENT",
      dueAt: new Date(now - 60 * 60_000),
    });
    const session = await loginAs(app, admin.email, FIXTURE_PASSWORD);

    const response = await request(app)
      .get("/service-orders")
      .query({ limit: 20 })
      .set("Cookie", session.cookie);

    expect(response.status).toBe(200);
    expect(response.body.items.map((order: { id: string }) => order.id)).toEqual([
      overdueUrgent.id,
      overdueLow.id,
      currentNear.id,
      currentTieUrgent.id,
      currentTieLow.id,
      currentFar.id,
      untracked.id,
      completed.id,
      cancelled.id,
    ]);
  });

  it("preserva filtros combinados, pagina a ordem global e desempata por id", async () => {
    const { user: admin } = await createFixtureUser("ADMIN");
    const { user: technician } = await createFixtureUser("TECHNICIAN");
    const { user: otherTechnician } = await createFixtureUser("TECHNICIAN");
    const customer = await createFixtureCustomer();
    const otherCustomer = await createFixtureCustomer();
    const now = Date.now();
    const tiedCreatedAt = new Date(now - 10 * 60_000);
    const common = {
      customerId: customer.id,
      createdById: admin.id,
      technicianId: technician.id,
      status: "WAITING" as const,
      priority: "HIGH" as const,
    };
    const overdueOld = await createQueueOrder({
      ...common,
      title: "Fila combinada vencida antiga",
      dueAt: new Date(now - 180 * 60_000),
    });
    const overdueRecent = await createQueueOrder({
      ...common,
      title: "Fila combinada vencida recente",
      dueAt: new Date(now - 60 * 60_000),
    });
    const currentNear = await createQueueOrder({
      ...common,
      title: "Fila combinada vigente próxima",
      dueAt: new Date(now + 30 * 60_000),
    });
    const currentFar = await createQueueOrder({
      ...common,
      title: "Fila combinada vigente distante",
      dueAt: new Date(now + 90 * 60_000),
    });
    const untrackedA = await createQueueOrder({
      ...common,
      title: "Fila combinada sem SLA A",
      createdAt: tiedCreatedAt,
    });
    const untrackedB = await createQueueOrder({
      ...common,
      title: "Fila combinada sem SLA B",
      createdAt: tiedCreatedAt,
    });
    await createQueueOrder({
      ...common,
      title: "Texto que não corresponde",
      dueAt: new Date(now - 300 * 60_000),
    });
    await createQueueOrder({
      ...common,
      customerId: otherCustomer.id,
      title: "Fila combinada outro cliente",
      dueAt: new Date(now - 300 * 60_000),
    });
    await createQueueOrder({
      ...common,
      technicianId: otherTechnician.id,
      title: "Fila combinada outro técnico",
      dueAt: new Date(now - 300 * 60_000),
    });
    const session = await loginAs(app, admin.email, FIXTURE_PASSWORD);
    const query = {
      status: "WAITING",
      priority: "HIGH",
      customerId: customer.id,
      technicianId: technician.id,
      search: "FILA COMBINADA",
      limit: 2,
    };

    const pages = await Promise.all([1, 2, 3].map((page) => request(app)
      .get("/service-orders")
      .query({ ...query, page })
      .set("Cookie", session.cookie)));
    const tiedIds = [untrackedA.id, untrackedB.id].sort().reverse();
    const expectedIds = [
      overdueOld.id,
      overdueRecent.id,
      currentNear.id,
      currentFar.id,
      ...tiedIds,
    ];

    for (const page of pages) {
      expect(page.status).toBe(200);
      expect(page.body.pagination).toMatchObject({ total: 6, totalPages: 3, limit: 2 });
    }
    expect(pages.flatMap((page) => page.body.items.map((order: { id: string }) => order.id)))
      .toEqual(expectedIds);

    const repeated = await request(app)
      .get("/service-orders")
      .query({ ...query, page: 3 })
      .set("Cookie", session.cookie);
    expect(repeated.body.items.map((order: { id: string }) => order.id)).toEqual(tiedIds);
  });
});
