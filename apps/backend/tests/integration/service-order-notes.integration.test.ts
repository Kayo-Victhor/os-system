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

const CUSTOMER_PASSWORD = "notes-customer-password-123";

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

async function setupOrders() {
  const { user: admin } = await createFixtureUser("ADMIN");
  const { user: attendant } = await createFixtureUser("ATTENDANT");
  const { user: technician } = await createFixtureUser("TECHNICIAN");
  const { user: otherTechnician } = await createFixtureUser("TECHNICIAN");
  const customer = await createFixtureCustomer();
  const ownOrder = await createFixtureServiceOrder({
    customerId: customer.id,
    createdById: admin.id,
    technicianId: technician.id,
  });
  const otherOrder = await createFixtureServiceOrder({
    customerId: customer.id,
    createdById: admin.id,
    technicianId: otherTechnician.id,
  });
  return { admin, attendant, technician, otherTechnician, customer, ownOrder, otherOrder };
}

describe("notas internas de ServiceOrder", () => {
  it("cria uma nota normalizada com autor derivado da sessão e sem misturá-la ao histórico", async () => {
    const { admin, ownOrder } = await setupOrders();
    const session = await loginAs(app, admin.email, FIXTURE_PASSWORD);

    const response = await request(app)
      .post(`/service-orders/${ownOrder.id}/notes`)
      .set("Cookie", session.cookie)
      .set("x-csrf-token", session.csrfHeader)
      .send({ content: "  Contatar o fornecedor antes da visita.  " });

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      content: "Contatar o fornecedor antes da visita.",
      author: { id: admin.id, name: admin.name },
    });
    expect(response.body).not.toHaveProperty("authorId");
    expect(await testPrisma.serviceOrderNote.findUnique({
      where: { id: response.body.id },
    })).toMatchObject({ authorId: admin.id, serviceOrderId: ownOrder.id });

    const detail = await request(app)
      .get(`/service-orders/${ownOrder.id}`)
      .set("Cookie", session.cookie);
    const events = await request(app)
      .get(`/service-orders/${ownOrder.id}/events`)
      .set("Cookie", session.cookie);
    expect(JSON.stringify(detail.body)).not.toContain("Contatar o fornecedor");
    expect(JSON.stringify(events.body)).not.toContain("Contatar o fornecedor");
  });

  it("rejeita conteúdo em branco, excessivo e campos de autoria enviados pelo cliente", async () => {
    const { admin, ownOrder } = await setupOrders();
    const session = await loginAs(app, admin.email, FIXTURE_PASSWORD);
    const post = (body: object) => request(app)
      .post(`/service-orders/${ownOrder.id}/notes`)
      .set("Cookie", session.cookie)
      .set("x-csrf-token", session.csrfHeader)
      .send(body);

    const [blank, excessive, massAssignment] = await Promise.all([
      post({ content: "   " }),
      post({ content: "a".repeat(2001) }),
      post({ content: "Nota válida", authorId: admin.id }),
    ]);

    expect(blank.status).toBe(400);
    expect(blank.body.details.fieldErrors.content).toContain(
      "A nota interna não pode ficar em branco",
    );
    expect(excessive.status).toBe(400);
    expect(excessive.body.details.fieldErrors.content).toContain(
      "A nota interna deve ter no máximo 2000 caracteres",
    );
    expect(massAssignment.status).toBe(400);
    expect(await testPrisma.serviceOrderNote.count()).toBe(0);
  });

  it("lista notas com paginação e ordenação estável das mais recentes para as antigas", async () => {
    const { admin, ownOrder } = await setupOrders();
    const session = await loginAs(app, admin.email, FIXTURE_PASSWORD);
    const start = new Date("2026-10-17T12:00:00.000Z").getTime();
    await testPrisma.serviceOrderNote.createMany({
      data: Array.from({ length: 22 }, (_, index) => ({
        serviceOrderId: ownOrder.id,
        authorId: admin.id,
        content: `Nota ${index + 1}`,
        createdAt: new Date(start + index * 1000),
      })),
    });

    const first = await request(app)
      .get(`/service-orders/${ownOrder.id}/notes?page=1&limit=20`)
      .set("Cookie", session.cookie);
    const second = await request(app)
      .get(`/service-orders/${ownOrder.id}/notes?page=2&limit=20`)
      .set("Cookie", session.cookie);

    expect(first.status).toBe(200);
    expect(first.body.items).toHaveLength(20);
    expect(first.body.items[0].content).toBe("Nota 22");
    expect(first.body.items[19].content).toBe("Nota 3");
    expect(first.body.pagination).toMatchObject({
      page: 1,
      total: 22,
      totalPages: 2,
      hasNextPage: true,
    });
    expect(second.body.items.map((note: { content: string }) => note.content))
      .toEqual(["Nota 2", "Nota 1"]);
  });

  it("permite ADMIN e ATTENDANT e limita TECHNICIAN à ordem atribuída", async () => {
    const { admin, attendant, technician, ownOrder, otherOrder } = await setupOrders();
    const adminSession = await loginAs(app, admin.email, FIXTURE_PASSWORD);
    const attendantSession = await loginAs(app, attendant.email, FIXTURE_PASSWORD);
    const technicianSession = await loginAs(app, technician.email, FIXTURE_PASSWORD);

    for (const [session, content] of [
      [adminSession, "Nota administrativa"],
      [attendantSession, "Nota do atendimento"],
      [technicianSession, "Nota técnica da ordem atribuída"],
    ] as const) {
      const response = await request(app)
        .post(`/service-orders/${ownOrder.id}/notes`)
        .set("Cookie", session.cookie)
        .set("x-csrf-token", session.csrfHeader)
        .send({ content });
      expect(response.status).toBe(201);
    }

    expect((await request(app)
      .get(`/service-orders/${ownOrder.id}/notes`)
      .set("Cookie", technicianSession.cookie)).status).toBe(200);
    expect((await request(app)
      .get(`/service-orders/${otherOrder.id}/notes`)
      .set("Cookie", technicianSession.cookie)).status).toBe(404);
    expect((await request(app)
      .post(`/service-orders/${otherOrder.id}/notes`)
      .set("Cookie", technicianSession.cookie)
      .set("x-csrf-token", technicianSession.csrfHeader)
      .send({ content: "Tentativa indevida" })).status).toBe(404);
    expect(await testPrisma.serviceOrderNote.count({
      where: { serviceOrderId: otherOrder.id },
    })).toBe(0);
  });

  it("exige autenticação e trata identificadores e filtros inválidos em pt-BR", async () => {
    const { ownOrder } = await setupOrders();
    expect((await request(app)
      .get(`/service-orders/${ownOrder.id}/notes`)).status).toBe(401);
    expect((await request(app)
      .post(`/service-orders/${ownOrder.id}/notes`)
      .send({ content: "Sem sessão" })).status).toBe(401);

    const { user: admin } = await createFixtureUser("ADMIN");
    const session = await loginAs(app, admin.email, FIXTURE_PASSWORD);
    const malformed = await request(app)
      .get("/service-orders/id-invalido/notes")
      .set("Cookie", session.cookie);
    const invalidQuery = await request(app)
      .get(`/service-orders/${ownOrder.id}/notes?page=zero`)
      .set("Cookie", session.cookie);
    expect(malformed.status).toBe(404);
    expect(malformed.body.error).toBe("Ordem de serviço não encontrada");
    expect(invalidQuery.status).toBe(400);
    expect(invalidQuery.body.error).toBe("Filtros inválidos");
  });

  it("não expõe notas ao portal do cliente nem às projeções públicas", async () => {
    const { admin, customer, ownOrder } = await setupOrders();
    const marker = "CONTEÚDO INTERNO SIGILOSO";
    await testPrisma.serviceOrderNote.create({
      data: { serviceOrderId: ownOrder.id, authorId: admin.id, content: marker },
    });
    const cookie = await customerCookie(customer.id, "notes-owner@example.com");

    const list = await request(app)
      .get("/auth/customer/service-orders")
      .set("Cookie", cookie);
    const detail = await request(app)
      .get(`/auth/customer/service-orders/${ownOrder.id}`)
      .set("Cookie", cookie);
    const events = await request(app)
      .get(`/auth/customer/service-orders/${ownOrder.id}/events`)
      .set("Cookie", cookie);
    const notesRoute = await request(app)
      .get(`/auth/customer/service-orders/${ownOrder.id}/notes`)
      .set("Cookie", cookie);

    expect(list.status).toBe(200);
    expect(detail.status).toBe(200);
    expect(events.status).toBe(200);
    expect(notesRoute.status).toBe(404);
    expect(JSON.stringify([list.body, detail.body, events.body])).not.toContain(marker);
    expect(JSON.stringify([list.body, detail.body, events.body])).not.toContain("notes");
  });

  it("preserva a nota sem autor após excluir o usuário e remove-a com a ordem", async () => {
    const { admin, attendant, ownOrder, otherOrder } = await setupOrders();
    const noteWithoutFutureAuthor = await testPrisma.serviceOrderNote.create({
      data: {
        serviceOrderId: ownOrder.id,
        authorId: attendant.id,
        content: "Nota que deve permanecer",
      },
    });
    await testPrisma.user.delete({ where: { id: attendant.id } });
    expect(await testPrisma.serviceOrderNote.findUnique({
      where: { id: noteWithoutFutureAuthor.id },
    })).toMatchObject({ authorId: null, content: "Nota que deve permanecer" });

    const session = await loginAs(app, admin.email, FIXTURE_PASSWORD);
    const listed = await request(app)
      .get(`/service-orders/${ownOrder.id}/notes`)
      .set("Cookie", session.cookie);
    expect(listed.body.items[0]).toMatchObject({
      content: "Nota que deve permanecer",
      author: null,
    });

    await testPrisma.serviceOrderNote.create({
      data: {
        serviceOrderId: otherOrder.id,
        authorId: admin.id,
        content: "Nota removida com a ordem",
      },
    });
    await testPrisma.serviceOrder.delete({ where: { id: otherOrder.id } });
    expect(await testPrisma.serviceOrderNote.count({
      where: { serviceOrderId: otherOrder.id },
    })).toBe(0);
  });
});
