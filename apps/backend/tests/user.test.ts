import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";

vi.mock("../src/lib/prisma.js", async () => {
  const { prismaMock } = await import("./helpers/prisma-mock.js");
  return { prisma: prismaMock };
});

import app from "../src/app.js";
import { prismaMock, resetPrismaMock } from "./helpers/prisma-mock.js";
import { authAs } from "./helpers/auth.js";

beforeEach(() => {
  resetPrismaMock();
});

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    name: "Carlos",
    email: "carlos@example.com",
    role: "USER",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("POST /users", () => {
  it("a non-ADMIN cannot create users", async () => {
    const { cookie, csrfHeader } = authAs("staff-1", "USER");

    const res = await request(app)
      .post("/users")
      .set("Cookie", cookie)
      .set("x-csrf-token", csrfHeader)
      .send({
        name: "Novo",
        email: "novo@example.com",
        password: "senha123",
      });

    expect(res.status).toBe(403);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it("an ADMIN can create a user", async () => {
    const { cookie, csrfHeader } = authAs("admin-1", "ADMIN");

    prismaMock.user.create.mockResolvedValueOnce(makeUser());

    const res = await request(app)
      .post("/users")
      .set("Cookie", cookie)
      .set("x-csrf-token", csrfHeader)
      .send({
        name: "Carlos",
        email: "carlos@example.com",
        password: "senha123",
        role: "USER",
      });

    expect(res.status).toBe(201);
    expect(res.body.password).toBeUndefined();
  });

  it("rejects creating a user with role=ADMIN through this endpoint", async () => {
    const { cookie, csrfHeader } = authAs("admin-1", "ADMIN");

    const res = await request(app)
      .post("/users")
      .set("Cookie", cookie)
      .set("x-csrf-token", csrfHeader)
      .send({
        name: "Carlos",
        email: "carlos@example.com",
        password: "senha123",
        role: "ADMIN",
      });

    expect(res.status).toBe(400);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });
});

describe("DELETE /users/:id", () => {
  it("blocks an admin from deleting their own account", async () => {
    const { cookie, csrfHeader } = authAs("admin-1", "ADMIN");

    const res = await request(app)
      .delete("/users/admin-1")
      .set("Cookie", cookie)
      .set("x-csrf-token", csrfHeader);

    expect(res.status).toBe(400);
    expect(prismaMock.user.delete).not.toHaveBeenCalled();
  });

  it("blocks deleting the last remaining admin", async () => {
    const { cookie, csrfHeader } = authAs("admin-1", "ADMIN");

    prismaMock.user.findUnique.mockResolvedValueOnce(
      makeUser({ id: "admin-2", role: "ADMIN" }),
    );
    prismaMock.user.count.mockResolvedValueOnce(0);

    const res = await request(app)
      .delete("/users/admin-2")
      .set("Cookie", cookie)
      .set("x-csrf-token", csrfHeader);

    expect(res.status).toBe(409);
    expect(prismaMock.user.delete).not.toHaveBeenCalled();
  });

  it("allows deleting a non-admin user", async () => {
    const { cookie, csrfHeader } = authAs("admin-1", "ADMIN");

    prismaMock.user.findUnique.mockResolvedValueOnce(makeUser());
    prismaMock.user.delete.mockResolvedValueOnce(makeUser());

    const res = await request(app)
      .delete("/users/user-1")
      .set("Cookie", cookie)
      .set("x-csrf-token", csrfHeader);

    expect(res.status).toBe(204);
  });
});

describe("PATCH /users/:id", () => {
  it("blocks demoting the last remaining admin", async () => {
    const { cookie, csrfHeader } = authAs("admin-1", "ADMIN");

    prismaMock.user.findUnique.mockResolvedValueOnce(
      makeUser({ id: "admin-2", role: "ADMIN" }),
    );
    prismaMock.user.count.mockResolvedValueOnce(0);

    const res = await request(app)
      .patch("/users/admin-2")
      .set("Cookie", cookie)
      .set("x-csrf-token", csrfHeader)
      .send({ role: "USER" });

    expect(res.status).toBe(409);
    expect(prismaMock.user.update).not.toHaveBeenCalled();
  });
});
