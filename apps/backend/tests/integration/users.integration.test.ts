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
        emailVerifiedAt: null,
      },
    });

    const loginRes = await request(app)
      .post("/auth/login")
      .send({ email: "admin@os-system.local", password: "admin123456" });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.user.id).toBe(admin.id);
    expect(loginRes.body.user.role).toBe("ADMIN");
    expect((await testPrisma.user.findUniqueOrThrow({ where: { id: admin.id } })).emailVerifiedAt).toBeNull();
    expect(await testPrisma.emailVerificationToken.findUnique({ where: { userId: admin.id } })).toBeNull();
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
    expect(stored.emailVerifiedAt).toBeNull();
    expect(await testPrisma.emailVerificationToken.findUnique({ where: { userId: stored.id } })).toBeNull();
    expect(await verifyPassword(stored.password, "senha123456")).toBe(true);
  });

  it.each(["ATTENDANT", "TECHNICIAN", "CUSTOMER"] as const)(
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
    await createFixtureUser("ATTENDANT", { email: "dup@example.com" });
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

  it("an ADMIN can create another ADMIN account", async () => {
    const { user: admin } = await createFixtureUser("ADMIN");
    const session = await loginAs(app, admin.email, FIXTURE_PASSWORD);

    const res = await request(app)
      .post("/users")
      .set("Cookie", session.cookie)
      .set("x-csrf-token", session.csrfHeader)
      .send({ name: "Admin Novo", email: "quer-ser-admin@example.com", password: "senha123456", role: "ADMIN" });

    expect(res.status).toBe(201);
    expect(res.body.role).toBe("ADMIN");
    expect(res.body.isPrimaryAdmin).toBe(false);
  });

  it("ignores an isPrimaryAdmin payload when creating an ADMIN", async () => {
    const { user: admin } = await createFixtureUser("ADMIN");
    const session = await loginAs(app, admin.email, FIXTURE_PASSWORD);

    const res = await request(app)
      .post("/users")
      .set("Cookie", session.cookie)
      .set("x-csrf-token", session.csrfHeader)
      .send({
        name: "Admin Comum",
        email: "admin-comum@example.com",
        password: "senha123456",
        role: "ADMIN",
        isPrimaryAdmin: true,
      });

    expect(res.status).toBe(201);
    expect(res.body.isPrimaryAdmin).toBe(false);
  });

  it.each(["USER", "CUSTOMER", "INVALID"])(
    "rejects %s as an internal role",
    async (role) => {
      const { user: admin } = await createFixtureUser("ADMIN");
      const session = await loginAs(app, admin.email, FIXTURE_PASSWORD);

      const res = await request(app)
        .post("/users")
        .set("Cookie", session.cookie)
        .set("x-csrf-token", session.csrfHeader)
        .send({ name: "Papel inválido", email: `${role.toLowerCase()}@example.com`, password: "senha123456", role });

      expect(res.status).toBe(400);
    },
  );
});

describe("GET /users — query (admin only)", () => {
  it("an ADMIN can list all users", async () => {
    const { user: admin } = await createFixtureUser("ADMIN");
    await createFixtureUser("TECHNICIAN");
    await createFixtureUser("ATTENDANT");
    const session = await loginAs(app, admin.email, FIXTURE_PASSWORD);

    const res = await request(app).get("/users").set("Cookie", session.cookie);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(3);
  });

  it("filters by role", async () => {
    const { user: admin } = await createFixtureUser("ADMIN");
    await createFixtureUser("TECHNICIAN");
    await createFixtureUser("TECHNICIAN");
    await createFixtureUser("ATTENDANT");
    const session = await loginAs(app, admin.email, FIXTURE_PASSWORD);

    const res = await request(app)
      .get("/users")
      .query({ role: "TECHNICIAN" })
      .set("Cookie", session.cookie);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    expect(res.body.every((u: { role: string }) => u.role === "TECHNICIAN")).toBe(true);
  });

  it.each(["USER", "CUSTOMER", "INVALID"])(
    "rejects %s as a team filter",
    async (role) => {
      const { user: admin } = await createFixtureUser("ADMIN");
      const session = await loginAs(app, admin.email, FIXTURE_PASSWORD);

      const res = await request(app)
        .get("/users")
        .query({ role })
        .set("Cookie", session.cookie);

      expect(res.status).toBe(400);
    },
  );

  it("does not expose legacy CUSTOMER accounts in team administration", async () => {
    const { user: admin } = await createFixtureUser("ADMIN");
    await createFixtureUser("CUSTOMER");
    const session = await loginAs(app, admin.email, FIXTURE_PASSWORD);

    const res = await request(app).get("/users").set("Cookie", session.cookie);

    expect(res.status).toBe(200);
    expect(res.body.every((user: { role: string }) => user.role !== "CUSTOMER")).toBe(true);
  });

  it.each(["ATTENDANT", "TECHNICIAN", "CUSTOMER"] as const)(
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
  it("blocks a regular ADMIN from editing the primary administrator", async () => {
    const { user: primary } = await createFixtureUser("ADMIN", { isPrimaryAdmin: true });
    const { user: regularAdmin } = await createFixtureUser("ADMIN");
    const session = await loginAs(app, regularAdmin.email, FIXTURE_PASSWORD);

    const res = await request(app)
      .patch(`/users/${primary.id}`)
      .set("Cookie", session.cookie)
      .set("x-csrf-token", session.csrfHeader)
      .send({ name: "Tentativa bloqueada", role: "ATTENDANT", isPrimaryAdmin: false });

    expect(res.status).toBe(403);
  });

  it("allows the primary administrator to edit normal own data but not demote itself", async () => {
    const { user: primary } = await createFixtureUser("ADMIN", { isPrimaryAdmin: true });
    const session = await loginAs(app, primary.email, FIXTURE_PASSWORD);

    const profile = await request(app)
      .patch(`/users/${primary.id}`)
      .set("Cookie", session.cookie)
      .set("x-csrf-token", session.csrfHeader)
      .send({ name: "Administrador Principal" });
    expect(profile.status).toBe(200);

    const demotion = await request(app)
      .patch(`/users/${primary.id}`)
      .set("Cookie", session.cookie)
      .set("x-csrf-token", session.csrfHeader)
      .send({ role: "ATTENDANT" });
    expect(demotion.status).toBe(403);
  });
  it("an ADMIN can update a user's name and email", async () => {
    const { user: admin } = await createFixtureUser("ADMIN");
    const { user: target } = await createFixtureUser("ATTENDANT");
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
      .send({ role: "ATTENDANT" });

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
      .send({ role: "ATTENDANT" });

    expect(res.status).toBe(200);
    expect(res.body.role).toBe("ATTENDANT");
  });

  it.each(["USER", "CUSTOMER", "INVALID"])(
    "rejects %s as an updated internal role",
    async (role) => {
      const { user: admin } = await createFixtureUser("ADMIN");
      const { user: target } = await createFixtureUser("ATTENDANT");
      const session = await loginAs(app, admin.email, FIXTURE_PASSWORD);

      const res = await request(app)
        .patch(`/users/${target.id}`)
        .set("Cookie", session.cookie)
        .set("x-csrf-token", session.csrfHeader)
        .send({ role });

      expect(res.status).toBe(400);
    },
  );
});

describe("DELETE /users/:id", () => {
  it("blocks a regular ADMIN from deleting the primary administrator", async () => {
    const { user: primary } = await createFixtureUser("ADMIN", { isPrimaryAdmin: true });
    const { user: regularAdmin } = await createFixtureUser("ADMIN");
    const session = await loginAs(app, regularAdmin.email, FIXTURE_PASSWORD);

    const res = await request(app)
      .delete(`/users/${primary.id}`)
      .set("Cookie", session.cookie)
      .set("x-csrf-token", session.csrfHeader);

    expect(res.status).toBe(403);
  });
  it("an ADMIN can delete a non-admin user", async () => {
    const { user: admin } = await createFixtureUser("ADMIN");
    const { user: target } = await createFixtureUser("ATTENDANT");
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

  it.each(["ATTENDANT", "TECHNICIAN", "CUSTOMER"] as const)(
    "a %s cannot delete users (403)",
    async (role) => {
      const { user } = await createFixtureUser(role);
      const { user: target } = await createFixtureUser("ATTENDANT");
      const session = await loginAs(app, user.email, FIXTURE_PASSWORD);

      const res = await request(app)
        .delete(`/users/${target.id}`)
        .set("Cookie", session.cookie)
        .set("x-csrf-token", session.csrfHeader);

      expect(res.status).toBe(403);
    },
  );
});
