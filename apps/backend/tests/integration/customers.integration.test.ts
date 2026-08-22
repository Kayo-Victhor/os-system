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
  it.each(["ADMIN", "USER"] as const)("a %s can create a customer", async (role) => {
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

  it.each(["TECHNICIAN", "CUSTOMER"] as const)("a %s cannot create a customer (403)", async (role) => {
    const { user } = await createFixtureUser(role);
    const session = await loginAs(app, user.email, FIXTURE_PASSWORD);

    const res = await request(app)
      .post("/customers")
      .set("Cookie", session.cookie)
      .set("x-csrf-token", session.csrfHeader)
      .send({ name: "Maria Souza" });

    expect(res.status).toBe(403);
  });

  it("rejects a name that's too short", async () => {
    const { user } = await createFixtureUser("USER");
    const session = await loginAs(app, user.email, FIXTURE_PASSWORD);

    const res = await request(app)
      .post("/customers")
      .set("Cookie", session.cookie)
      .set("x-csrf-token", session.csrfHeader)
      .send({ name: "a" });

    expect(res.status).toBe(400);
  });

  it("rejects a duplicate document with 409", async () => {
    const { user } = await createFixtureUser("USER");
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
    const { user } = await createFixtureUser("USER");
    await createFixtureCustomer({ name: "Alice" });
    await createFixtureCustomer({ name: "Bob" });
    const session = await loginAs(app, user.email, FIXTURE_PASSWORD);

    const res = await request(app).get("/customers").set("Cookie", session.cookie);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it("searches by name (case-insensitive)", async () => {
    const { user } = await createFixtureUser("USER");
    await createFixtureCustomer({ name: "Alice Wonderland" });
    await createFixtureCustomer({ name: "Bob Builder" });
    const session = await loginAs(app, user.email, FIXTURE_PASSWORD);

    const res = await request(app)
      .get("/customers")
      .query({ search: "alice" })
      .set("Cookie", session.cookie);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].name).toBe("Alice Wonderland");
  });

  it("a TECHNICIAN can read customers (but not write)", async () => {
    const { user } = await createFixtureUser("TECHNICIAN");
    await createFixtureCustomer();
    const session = await loginAs(app, user.email, FIXTURE_PASSWORD);

    const res = await request(app).get("/customers").set("Cookie", session.cookie);

    expect(res.status).toBe(200);
  });

  it("returns 404 for a nonexistent customer", async () => {
    const { user } = await createFixtureUser("USER");
    const session = await loginAs(app, user.email, FIXTURE_PASSWORD);

    const res = await request(app)
      .get("/customers/00000000-0000-0000-0000-000000000000")
      .set("Cookie", session.cookie);

    expect(res.status).toBe(404);
  });
});

describe("PATCH /customers/:id — update", () => {
  it.each(["ADMIN", "USER"] as const)("a %s can update a customer", async (role) => {
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

  it.each(["USER", "TECHNICIAN"] as const)("a %s cannot delete a customer (403)", async (role) => {
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
