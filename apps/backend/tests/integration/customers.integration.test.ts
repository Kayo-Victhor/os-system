import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";

import app from "../../src/app.js";
import { resetDatabase, testPrisma } from "../helpers/test-db.js";
import { createFixtureUser, createFixtureCustomer, FIXTURE_PASSWORD } from "../helpers/fixtures.js";
import { loginAs } from "../helpers/integration-auth.js";

beforeEach(async () => {
  await resetDatabase();
});

describe("POST /customers — creation", () => {
  it.each(["ADMIN", "ATTENDANT"] as const)("a %s can create a customer", async (role) => {
    const { user } = await createFixtureUser(role);
    const session = await loginAs(app, user.email, FIXTURE_PASSWORD);

    const res = await request(app)
      .post("/customers")
      .set("Cookie", session.cookie)
      .set("x-csrf-token", session.csrfHeader)
      .send({ name: "Maria Souza", email: "maria.souza@example.com", document: "12345678900" });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Maria Souza");

    const stored = await testPrisma.customer.findUniqueOrThrow({ where: { id: res.body.id } });
    expect(stored.email).toBe("maria.souza@example.com");
  });

  it("rejects a name that's too short", async () => {
    const { user } = await createFixtureUser("ATTENDANT");
    const session = await loginAs(app, user.email, FIXTURE_PASSWORD);

    const res = await request(app)
      .post("/customers")
      .set("Cookie", session.cookie)
      .set("x-csrf-token", session.csrfHeader)
      .send({ name: "a" });

    expect(res.status).toBe(400);
  });

  it("rejects a duplicate document with 409", async () => {
    const { user } = await createFixtureUser("ATTENDANT");
    await createFixtureCustomer({ document: "99988877766" });
    const session = await loginAs(app, user.email, FIXTURE_PASSWORD);

    const res = await request(app)
      .post("/customers")
      .set("Cookie", session.cookie)
      .set("x-csrf-token", session.csrfHeader)
      .send({ name: "Outro Cliente", document: "99988877766" });

    expect(res.status).toBe(409);
  });
});

describe("GET /customers — query and search", () => {
  it("lists customers", async () => {
    const { user } = await createFixtureUser("ATTENDANT");
    await createFixtureCustomer({ name: "Alice" });
    await createFixtureCustomer({ name: "Bob" });
    const session = await loginAs(app, user.email, FIXTURE_PASSWORD);

    const res = await request(app).get("/customers").set("Cookie", session.cookie);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.pagination).toMatchObject({ page: 1, limit: 20, total: 2, totalPages: 1 });
  });

  it("searches by name (case-insensitive)", async () => {
    const { user } = await createFixtureUser("ATTENDANT");
    await createFixtureCustomer({ name: "Alice Wonderland" });
    await createFixtureCustomer({ name: "Bob Builder" });
    const session = await loginAs(app, user.email, FIXTURE_PASSWORD);

    const res = await request(app)
      .get("/customers")
      .query({ search: "alice" })
      .set("Cookie", session.cookie);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].name).toBe("Alice Wonderland");
    expect(res.body.pagination.total).toBe(1);
  });

  it("a TECHNICIAN can read customers (but not write)", async () => {
    const { user } = await createFixtureUser("TECHNICIAN");
    await createFixtureCustomer();
    const session = await loginAs(app, user.email, FIXTURE_PASSWORD);

    const res = await request(app).get("/customers").set("Cookie", session.cookie);

    expect(res.status).toBe(200);
  });

  it("returns 404 for a nonexistent customer", async () => {
    const { user } = await createFixtureUser("ATTENDANT");
    const session = await loginAs(app, user.email, FIXTURE_PASSWORD);

    const res = await request(app)
      .get("/customers/00000000-0000-0000-0000-000000000000")
      .set("Cookie", session.cookie);

    expect(res.status).toBe(404);
  });
});

describe("GET /customers — pagination", () => {
  it("returns an empty paginated collection when no customers exist", async () => {
    const { user } = await createFixtureUser("ADMIN");
    const session = await loginAs(app, user.email, FIXTURE_PASSWORD);

    const response = await request(app).get("/customers").set("Cookie", session.cookie);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      items: [],
      pagination: {
        page: 1, limit: 20, total: 0, totalPages: 0, hasPreviousPage: false, hasNextPage: false,
      },
    });
  });

  it("returns deterministic pages, including the last and a page beyond the result", async () => {
    const { user } = await createFixtureUser("ADMIN");
    const customers = await Promise.all(Array.from({ length: 25 }, (_, index) => (
      createFixtureCustomer({ name: `Cliente paginado ${index + 1}` })
    )));
    const sameTimestamp = new Date("2026-10-17T12:00:00.000Z");
    await Promise.all(customers.map((customer) => testPrisma.customer.update({
      where: { id: customer.id },
      data: { createdAt: sameTimestamp },
    })));
    const session = await loginAs(app, user.email, FIXTURE_PASSWORD);

    const firstPage = await request(app).get("/customers")
      .query({ limit: 10 }).set("Cookie", session.cookie);
    const middlePage = await request(app).get("/customers")
      .query({ page: 2, limit: 10 }).set("Cookie", session.cookie);
    const lastPage = await request(app).get("/customers")
      .query({ page: 3, limit: 10 }).set("Cookie", session.cookie);
    const beyondLastPage = await request(app).get("/customers")
      .query({ page: 4, limit: 10 }).set("Cookie", session.cookie);
    const expectedIds = customers.map((customer) => customer.id).sort().reverse();

    expect(firstPage.body.items.map((customer: { id: string }) => customer.id)).toEqual(expectedIds.slice(0, 10));
    expect(firstPage.body.pagination).toEqual({
      page: 1, limit: 10, total: 25, totalPages: 3, hasPreviousPage: false, hasNextPage: true,
    });
    expect(middlePage.body.items.map((customer: { id: string }) => customer.id)).toEqual(expectedIds.slice(10, 20));
    expect(lastPage.body.items.map((customer: { id: string }) => customer.id)).toEqual(expectedIds.slice(20));
    expect(lastPage.body.pagination).toMatchObject({ page: 3, hasNextPage: false });
    expect(beyondLastPage.body).toMatchObject({
      items: [],
      pagination: { page: 4, total: 25, totalPages: 3, hasPreviousPage: true, hasNextPage: false },
    });
  });

  it("uses the default and maximum limits, and rejects invalid parameters", async () => {
    const { user } = await createFixtureUser("ADMIN");
    await Promise.all(Array.from({ length: 21 }, (_, index) => (
      createFixtureCustomer({ name: `Cliente limite ${index + 1}` })
    )));
    const session = await loginAs(app, user.email, FIXTURE_PASSWORD);

    const defaultLimit = await request(app).get("/customers").set("Cookie", session.cookie);
    const maximumLimit = await request(app).get("/customers")
      .query({ limit: 100 }).set("Cookie", session.cookie);
    expect(defaultLimit.body).toMatchObject({ pagination: { limit: 20, total: 21, totalPages: 2 } });
    expect(defaultLimit.body.items).toHaveLength(20);
    expect(maximumLimit.body).toMatchObject({ pagination: { limit: 100, total: 21, totalPages: 1 } });
    expect(maximumLimit.body.items).toHaveLength(21);

    for (const query of [
      { page: 0 }, { page: -1 }, { page: "1.5" }, { page: "abc" }, { limit: 0 }, { limit: -1 }, { limit: "1.5" }, { limit: 101 },
    ]) {
      const response = await request(app).get("/customers").query(query).set("Cookie", session.cookie);
      expect(response.status).toBe(400);
      expect(response.body.error).toBe("Filtros inválidos");
    }
  });

  it("counts only the customers matched by the text search", async () => {
    const { user } = await createFixtureUser("ATTENDANT");
    await createFixtureCustomer({ name: "Cliente Alfa", email: "alfa@example.test" });
    await createFixtureCustomer({ name: "Cliente Beta", document: "BETA-123" });
    await createFixtureCustomer({ name: "Outro cadastro" });
    const session = await loginAs(app, user.email, FIXTURE_PASSWORD);

    const byEmail = await request(app).get("/customers")
      .query({ search: "ALFA", limit: 1 }).set("Cookie", session.cookie);
    const byDocument = await request(app).get("/customers")
      .query({ search: "beta", limit: 1 }).set("Cookie", session.cookie);

    expect(byEmail.body).toMatchObject({ items: [{ name: "Cliente Alfa" }], pagination: { total: 1, totalPages: 1 } });
    expect(byDocument.body).toMatchObject({ items: [{ name: "Cliente Beta" }], pagination: { total: 1, totalPages: 1 } });
  });
});

describe("PATCH /customers/:id — update", () => {
  it.each(["ADMIN", "ATTENDANT"] as const)("a %s can update a customer", async (role) => {
    const { user } = await createFixtureUser(role);
    const customer = await createFixtureCustomer({ name: "Nome Antigo" });
    const session = await loginAs(app, user.email, FIXTURE_PASSWORD);

    const res = await request(app)
      .patch(`/customers/${customer.id}`)
      .set("Cookie", session.cookie)
      .set("x-csrf-token", session.csrfHeader)
      .send({ name: "Nome Novo" });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Nome Novo");
  });

  it("a TECHNICIAN cannot update a customer (403)", async () => {
    const { user } = await createFixtureUser("TECHNICIAN");
    const customer = await createFixtureCustomer();
    const session = await loginAs(app, user.email, FIXTURE_PASSWORD);

    const res = await request(app)
      .patch(`/customers/${customer.id}`)
      .set("Cookie", session.cookie)
      .set("x-csrf-token", session.csrfHeader)
      .send({ name: "Novo Nome" });

    expect(res.status).toBe(403);
  });

  it("validates fields on update", async () => {
    const { user } = await createFixtureUser("ADMIN");
    const customer = await createFixtureCustomer();
    const session = await loginAs(app, user.email, FIXTURE_PASSWORD);

    const res = await request(app)
      .patch(`/customers/${customer.id}`)
      .set("Cookie", session.cookie)
      .set("x-csrf-token", session.csrfHeader)
      .send({ email: "not-a-valid-email" });

    expect(res.status).toBe(400);
  });
});

describe("DELETE /customers/:id", () => {
  it("an ADMIN can delete a customer", async () => {
    const { user } = await createFixtureUser("ADMIN");
    const customer = await createFixtureCustomer();
    const session = await loginAs(app, user.email, FIXTURE_PASSWORD);

    const res = await request(app)
      .delete(`/customers/${customer.id}`)
      .set("Cookie", session.cookie)
      .set("x-csrf-token", session.csrfHeader);

    expect(res.status).toBe(204);
    expect(await testPrisma.customer.findUnique({ where: { id: customer.id } })).toBeNull();
  });

  it.each(["ATTENDANT", "TECHNICIAN"] as const)("a %s cannot delete a customer (403)", async (role) => {
    const { user } = await createFixtureUser(role);
    const customer = await createFixtureCustomer();
    const session = await loginAs(app, user.email, FIXTURE_PASSWORD);

    const res = await request(app)
      .delete(`/customers/${customer.id}`)
      .set("Cookie", session.cookie)
      .set("x-csrf-token", session.csrfHeader);

    expect(res.status).toBe(403);
    expect(await testPrisma.customer.findUnique({ where: { id: customer.id } })).not.toBeNull();
  });
});
