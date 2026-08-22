import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";

import app from "../../src/app.js";
import { resetDatabase, testPrisma } from "../helpers/test-db.js";
import { createFixtureUser, FIXTURE_PASSWORD } from "../helpers/fixtures.js";
import { loginAs } from "../helpers/integration-auth.js";
import { hashPassword, verifyPassword } from "../../src/lib/password.js";

beforeEach(async () => {
  await resetDatabase();
});

describe("Initial admin (seed equivalent)", () => {
  it("an admin created the way prisma/seed.ts does it can log in", async () => {
    // Mirrors seed.ts exactly (hash + create with role ADMIN) rather than
    // importing the script directly, since seed.ts runs main() as a
    // top-level side effect on import (including process.exit on error),
    // which isn't safe to trigger from a test file.
    const passwordHash = await hashPassword("admin123456");
    const admin = await testPrisma.user.create({
      data: {
        name: "Administrador",
        email: "admin@os-system.local",
        password: passwordHash,
        role: "ADMIN",
      },
    });

    const loginRes = await request(app)
      .post("/auth/login")
      .send({ email: "admin@os-system.local", password: "admin123456" });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.user.id).toBe(admin.id);
    expect(loginRes.body.user.role).toBe("ADMIN");
  });
});

describe("POST /users — creation (admin only)", () => {
  it("an ADMIN can create a TECHNICIAN account", async () => {
    const { user: admin } = await createFixtureUser("ADMIN");
    const session = await loginAs(app, admin.email, FIXTURE_PASSWORD);

    const res = await request(app)
      .post("/users")
      .set("Cookie", session.cookie)
      .set("x-csrf-token", session.csrfHeader)
      .send({
        name: "Técnico Novo",
        email: "tecnico-novo@example.com",
        password: "senha123456",
        role: "TECHNICIAN",
      });

    expect(res.status).toBe(201);
    expect(res.body.role).toBe("TECHNICIAN");

    const stored = await testPrisma.user.findUniqueOrThrow({
      where: { email: "tecnico-novo@example.com" },
    });
    expect(stored.role).toBe("TECHNICIAN");
    expect(await verifyPassword(stored.password, "senha123456")).toBe(true);
  });

  it.each(["USER", "TECHNICIAN", "CUSTOMER"] as const)(
    "a %s cannot create users (403)",
    async (role) => {
      const { user } = await createFixtureUser(role);
      const session = await loginAs(app, user.email, FIXTURE_PASSWORD);

      const res = await request(app)
        .post("/users")
        .set("Cookie", session.cookie)
        .set("x-csrf-token", session.csrfHeader)
        .send({ name: "X", email: "x@example.com", password: "senha123456" });

      expect(res.status).toBe(403);
    },
  );

  it("rejects a duplicate email with 409", async () => {
    const { user: admin } = await createFixtureUser("ADMIN");
    await createFixtureUser("USER", { email: "dup@example.com" });
    const session = await loginAs(app, admin.email, FIXTURE_PASSWORD);

    const res = await request(app)
      .post("/users")
      .set("Cookie", session.cookie)
      .set("x-csrf-token", session.csrfHeader)
      .send({ name: "Outro", email: "dup@example.com", password: "senha123456" });

    expect(res.status).toBe(409);
  });

  it("rejects a password shorter than the minimum", async () => {
    const { user: admin } = await createFixtureUser("ADMIN");
    const session = await loginAs(app, admin.email, FIXTURE_PASSWORD);

    const res = await request(app)
      .post("/users")
      .set("Cookie", session.cookie)
      .set("x-csrf-token", session.csrfHeader)
      .send({ name: "X", email: "curta@example.com", password: "123" });

    expect(res.status).toBe(400);
  });

  it("cannot be used to create an ADMIN account", async () => {
    const { user: admin } = await createFixtureUser("ADMIN");
    const session = await loginAs(app, admin.email, FIXTURE_PASSWORD);

    const res = await request(app)
      .post("/users")
      .set("Cookie", session.cookie)
      .set("x-csrf-token", session.csrfHeader)
      .send({ name: "X", email: "quer-ser-admin@example.com", password: "senha123456", role: "ADMIN" });

    expect(res.status).toBe(400);
  });
});

describe("GET /users — query (admin only)", () => {
  it("an ADMIN can list all users", async () => {
    const { user: admin } = await createFixtureUser("ADMIN");
    await createFixtureUser("TECHNICIAN");
    await createFixtureUser("USER");
    const session = await loginAs(app, admin.email, FIXTURE_PASSWORD);

    const res = await request(app).get("/users").set("Cookie", session.cookie);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
  });

  it("filters by role", async () => {
    const { user: admin } = await createFixtureUser("ADMIN");
    await createFixtureUser("TECHNICIAN");
    await createFixtureUser("TECHNICIAN");
    await createFixtureUser("USER");
    const session = await loginAs(app, admin.email, FIXTURE_PASSWORD);

    const res = await request(app)
      .get("/users")
      .query({ role: "TECHNICIAN" })
      .set("Cookie", session.cookie);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body.every((u: { role: string }) => u.role === "TECHNICIAN")).toBe(true);
  });

  it.each(["USER", "TECHNICIAN", "CUSTOMER"] as const)(
    "a %s cannot list users (403)",
    async (role) => {
      const { user } = await createFixtureUser(role);
      const session = await loginAs(app, user.email, FIXTURE_PASSWORD);

      const res = await request(app).get("/users").set("Cookie", session.cookie);

      expect(res.status).toBe(403);
    },
  );
});

describe("PATCH /users/:id — update", () => {
  it("an ADMIN can update a user's name and email", async () => {
    const { user: admin } = await createFixtureUser("ADMIN");
    const { user: target } = await createFixtureUser("USER");
    const session = await loginAs(app, admin.email, FIXTURE_PASSWORD);

    const res = await request(app)
      .patch(`/users/${target.id}`)
      .set("Cookie", session.cookie)
      .set("x-csrf-token", session.csrfHeader)
      .send({ name: "Nome Atualizado" });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe("Nome Atualizado");
  });

  it("blocks demoting the last remaining ADMIN", async () => {
    const { user: admin } = await createFixtureUser("ADMIN");
    const session = await loginAs(app, admin.email, FIXTURE_PASSWORD);

    const res = await request(app)
      .patch(`/users/${admin.id}`)
      .set("Cookie", session.cookie)
      .set("x-csrf-token", session.csrfHeader)
      .send({ role: "USER" });

    expect(res.status).toBe(409);

    const stillAdmin = await testPrisma.user.findUniqueOrThrow({ where: { id: admin.id } });
    expect(stillAdmin.role).toBe("ADMIN");
  });

  it("allows demoting an admin when another admin still exists", async () => {
    const { user: admin1 } = await createFixtureUser("ADMIN");
    const { user: admin2 } = await createFixtureUser("ADMIN");
    const session = await loginAs(app, admin1.email, FIXTURE_PASSWORD);

    const res = await request(app)
      .patch(`/users/${admin2.id}`)
      .set("Cookie", session.cookie)
      .set("x-csrf-token", session.csrfHeader)
      .send({ role: "USER" });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe("USER");
  });
});

describe("DELETE /users/:id", () => {
  it("an ADMIN can delete a non-admin user", async () => {
    const { user: admin } = await createFixtureUser("ADMIN");
    const { user: target } = await createFixtureUser("USER");
    const session = await loginAs(app, admin.email, FIXTURE_PASSWORD);

    const res = await request(app)
      .delete(`/users/${target.id}`)
      .set("Cookie", session.cookie)
      .set("x-csrf-token", session.csrfHeader);

    expect(res.status).toBe(204);
    expect(await testPrisma.user.findUnique({ where: { id: target.id } })).toBeNull();
  });

  it("blocks an admin from deleting their own account", async () => {
    const { user: admin } = await createFixtureUser("ADMIN");
    const session = await loginAs(app, admin.email, FIXTURE_PASSWORD);

    const res = await request(app)
      .delete(`/users/${admin.id}`)
      .set("Cookie", session.cookie)
      .set("x-csrf-token", session.csrfHeader);

    expect(res.status).toBe(400);
    expect(await testPrisma.user.findUnique({ where: { id: admin.id } })).not.toBeNull();
  });

  it("allows deleting an admin when other admins remain", async () => {
    const { user: admin1 } = await createFixtureUser("ADMIN");
    const { user: admin2 } = await createFixtureUser("ADMIN");
    const session = await loginAs(app, admin1.email, FIXTURE_PASSWORD);

    const res = await request(app)
      .delete(`/users/${admin2.id}`)
      .set("Cookie", session.cookie)
      .set("x-csrf-token", session.csrfHeader);

    expect(res.status).toBe(204);

    const remainingAdmins = await testPrisma.user.count({ where: { role: "ADMIN" } });
    expect(remainingAdmins).toBe(1);
  });

  // Note: a *non-self* actor deleting the *last* remaining admin is not a
  // reachable scenario given the current permission model — only ADMIN
  // has USER_DELETE, so if exactly one admin exists, the only account
  // that could attempt to delete them is that same admin, which the
  // self-delete guard above already blocks (400) before the last-admin
  // count check (409) would even run. The 409 path exists as defense in
  // depth for if that ever changes (e.g. a future role gains
  // USER_DELETE), not because it fires today.

  it.each(["USER", "TECHNICIAN", "CUSTOMER"] as const)(
    "a %s cannot delete users (403)",
    async (role) => {
      const { user } = await createFixtureUser(role);
      const { user: target } = await createFixtureUser("USER");
      const session = await loginAs(app, user.email, FIXTURE_PASSWORD);

      const res = await request(app)
        .delete(`/users/${target.id}`)
        .set("Cookie", session.cookie)
        .set("x-csrf-token", session.csrfHeader);

      expect(res.status).toBe(403);
    },
  );
});
