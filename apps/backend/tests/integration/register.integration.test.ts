import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";

import app from "../../src/app.js";
import { resetDatabase, testPrisma } from "../helpers/test-db.js";
import { createFixtureUser, FIXTURE_PASSWORD } from "../helpers/fixtures.js";
import { loginAs } from "../helpers/integration-auth.js";

beforeEach(async () => {
  await resetDatabase();
});

describe("POST /auth/register — public self-registration", () => {
  it("creates an account with role CUSTOMER, always", async () => {
    const res = await request(app).post("/auth/register").send({
      name: "João Cliente",
      email: "joao@example.com",
      password: "senha123456",
    });

    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe("CUSTOMER");
    expect(res.body.user.password).toBeUndefined();

    const stored = await testPrisma.user.findUniqueOrThrow({
      where: { email: "joao@example.com" },
    });
    expect(stored.role).toBe("CUSTOMER");
    expect(stored.password).not.toBe("senha123456");
    expect(stored.password.startsWith("$argon2id$")).toBe(true);
  });

  it("ignores a client-supplied role of ADMIN and still creates a CUSTOMER", async () => {
    const res = await request(app).post("/auth/register").send({
      name: "Tentativa Admin",
      email: "tentativa-admin@example.com",
      password: "senha123456",
      role: "ADMIN",
    });

    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe("CUSTOMER");

    const stored = await testPrisma.user.findUniqueOrThrow({
      where: { email: "tentativa-admin@example.com" },
    });
    expect(stored.role).toBe("CUSTOMER");
  });

  it("ignores a client-supplied role of TECHNICIAN and still creates a CUSTOMER", async () => {
    const res = await request(app).post("/auth/register").send({
      name: "Tentativa Tecnico",
      email: "tentativa-tech@example.com",
      password: "senha123456",
      role: "TECHNICIAN",
    });

    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe("CUSTOMER");
  });

  it("rejects a duplicate email with 409", async () => {
    await createFixtureUser("CUSTOMER", { email: "existing@example.com" });

    const res = await request(app).post("/auth/register").send({
      name: "Outra Pessoa",
      email: "existing@example.com",
      password: "senha123456",
    });

    expect(res.status).toBe(409);
  });

  it("rejects a password shorter than the minimum", async () => {
    const res = await request(app).post("/auth/register").send({
      name: "Nome Valido",
      email: "senha-curta@example.com",
      password: "123",
    });

    expect(res.status).toBe(400);

    const stored = await testPrisma.user.findUnique({
      where: { email: "senha-curta@example.com" },
    });
    expect(stored).toBeNull();
  });

  it("rejects an invalid email format", async () => {
    const res = await request(app).post("/auth/register").send({
      name: "Nome Valido",
      email: "not-an-email",
      password: "senha123456",
    });

    expect(res.status).toBe(400);
  });

  it("rejects missing required fields", async () => {
    const res = await request(app).post("/auth/register").send({
      email: "faltando-nome@example.com",
      password: "senha123456",
    });

    expect(res.status).toBe(400);
  });

  it("allows logging in immediately after registering", async () => {
    await request(app).post("/auth/register").send({
      name: "Maria Cliente",
      email: "maria@example.com",
      password: "senha123456",
    });

    const loginRes = await request(app)
      .post("/auth/login")
      .send({ email: "maria@example.com", password: "senha123456" });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.user.role).toBe("CUSTOMER");
  });
});

describe("CUSTOMER access control", () => {
  it("a CUSTOMER can access routes available to any authenticated user (GET /auth/me)", async () => {
    const { user } = await createFixtureUser("CUSTOMER");
    const session = await loginAs(app, user.email, FIXTURE_PASSWORD);

    const res = await request(app).get("/auth/me").set("Cookie", session.cookie);

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe("CUSTOMER");
  });

  it("a CUSTOMER cannot access administrative functionality (GET /users)", async () => {
    const { user } = await createFixtureUser("CUSTOMER");
    const session = await loginAs(app, user.email, FIXTURE_PASSWORD);

    const res = await request(app).get("/users").set("Cookie", session.cookie);

    expect(res.status).toBe(403);
  });

  it("a CUSTOMER cannot create service orders", async () => {
    const { user } = await createFixtureUser("CUSTOMER");
    const session = await loginAs(app, user.email, FIXTURE_PASSWORD);

    const res = await request(app)
      .post("/service-orders")
      .set("Cookie", session.cookie)
      .set("x-csrf-token", session.csrfHeader)
      .send({ title: "x", description: "y", customerId: "00000000-0000-0000-0000-000000000000" });

    expect(res.status).toBe(403);
  });

  it("a CUSTOMER cannot create business customer records", async () => {
    const { user } = await createFixtureUser("CUSTOMER");
    const session = await loginAs(app, user.email, FIXTURE_PASSWORD);

    const res = await request(app)
      .post("/customers")
      .set("Cookie", session.cookie)
      .set("x-csrf-token", session.csrfHeader)
      .send({ name: "Alguém" });

    expect(res.status).toBe(403);
  });
});
