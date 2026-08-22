import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";

// Hoisted by vitest above the imports below, so lib/prisma.js is mocked
// before app.js (which imports it transitively) is ever evaluated.
vi.mock("../src/lib/prisma.js", async () => {
  const { prismaMock } = await import("./helpers/prisma-mock.js");
  return { prisma: prismaMock };
});

import app from "../src/app.js";
import { prismaMock, resetPrismaMock } from "./helpers/prisma-mock.js";
import { hashPassword } from "../src/lib/password.js";
import { authAs } from "./helpers/auth.js";

const VALID_PASSWORD = "correct-horse-battery-staple";

beforeEach(() => {
  resetPrismaMock();
});

describe("POST /auth/login", () => {
  it("logs in with valid credentials and sets session cookies", async () => {
    const passwordHash = await hashPassword(VALID_PASSWORD);

    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "user-1",
      name: "Ana",
      email: "ana@example.com",
      password: passwordHash,
      role: "ADMIN",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    prismaMock.user.findUniqueOrThrow.mockResolvedValueOnce({
      id: "user-1",
      name: "Ana",
      email: "ana@example.com",
      password: passwordHash,
      role: "ADMIN",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    prismaMock.refreshToken.create.mockResolvedValueOnce({});

    const res = await request(app)
      .post("/auth/login")
      .send({ email: "ana@example.com", password: VALID_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.user).toEqual({
      id: "user-1",
      name: "Ana",
      email: "ana@example.com",
      role: "ADMIN",
    });
    // No secrets should ever be echoed back.
    expect(res.body.user.password).toBeUndefined();
    expect(res.body.accessToken).toBeUndefined();

    const cookies = res.headers["set-cookie"] as unknown as string[];
    expect(cookies.some((c) => c.startsWith("access_token="))).toBe(true);
    expect(cookies.some((c) => c.startsWith("refresh_token="))).toBe(true);
    expect(cookies.some((c) => c.startsWith("csrf_token="))).toBe(true);
    expect(cookies.find((c) => c.startsWith("access_token="))).toMatch(
      /HttpOnly/i,
    );
  });

  it("rejects an unknown email with a generic message (no user enumeration)", async () => {
    prismaMock.user.findUnique.mockResolvedValueOnce(null);

    const res = await request(app)
      .post("/auth/login")
      .send({ email: "ghost@example.com", password: "whatever123" });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Credenciais inválidas");
    expect(res.body.error.toLowerCase()).not.toContain("não existe");
  });

  it("rejects a wrong password with the same generic message", async () => {
    const passwordHash = await hashPassword(VALID_PASSWORD);

    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "user-1",
      name: "Ana",
      email: "ana@example.com",
      password: passwordHash,
      role: "ADMIN",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await request(app)
      .post("/auth/login")
      .send({ email: "ana@example.com", password: "wrong-password" });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Credenciais inválidas");
  });

  it("rejects malformed input before touching the database", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: "not-an-email", password: "" });

    expect(res.status).toBe(400);
    expect(prismaMock.user.findUnique).not.toHaveBeenCalled();
  });
});

describe("Session protection", () => {
  it("rejects requests with no session cookie", async () => {
    const res = await request(app).get("/auth/me");
    expect(res.status).toBe(401);
  });

  it("rejects a garbage/forged token", async () => {
    const res = await request(app)
      .get("/auth/me")
      .set("Cookie", "access_token=not-a-real-jwt");

    expect(res.status).toBe(401);
  });

  it("accepts a valid session cookie", async () => {
    const { cookie } = authAs("user-1", "ADMIN");

    prismaMock.user.findUnique.mockResolvedValueOnce({
      id: "user-1",
      name: "Ana",
      email: "ana@example.com",
      role: "ADMIN",
    });

    const res = await request(app).get("/auth/me").set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe("user-1");
  });
});

describe("POST /auth/refresh", () => {
  it("returns 401 when there is no refresh cookie", async () => {
    const res = await request(app).post("/auth/refresh");
    expect(res.status).toBe(401);
  });

  it("returns 401 and clears cookies for an unknown/expired token", async () => {
    prismaMock.refreshToken.findUnique.mockResolvedValueOnce(null);

    const res = await request(app)
      .post("/auth/refresh")
      .set("Cookie", "refresh_token=some-old-token");

    expect(res.status).toBe(401);
  });
});

describe("POST /auth/logout", () => {
  it("clears session cookies even with no active session", async () => {
    const res = await request(app).post("/auth/logout");

    expect(res.status).toBe(204);
    const cookies = res.headers["set-cookie"] as unknown as string[];
    expect(cookies.some((c) => c.startsWith("access_token=;"))).toBe(true);
  });
});
