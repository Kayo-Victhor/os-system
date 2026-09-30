import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";

vi.mock("../src/lib/prisma.js", async () => {
  const { prismaMock } = await import("./helpers/prisma-mock.js");
  return { prisma: prismaMock };
});

const originalNodeEnv = process.env.NODE_ENV;

beforeEach(() => {
  vi.resetModules();
  process.env.NODE_ENV = "development";
});

afterEach(() => {
  process.env.NODE_ENV = originalNodeEnv;
});

describe("Rate limit de autenticação", () => {
  it("blocks the eleventh request in the 15-minute window", async () => {
    const { default: app } = await import("../src/app.js");
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await request(app).post("/auth/resend-verification").send({ email: "limite@example.com" });
      expect(response.status).not.toBe(429);
    }
    const blocked = await request(app).post("/auth/resend-verification").send({ email: "limite@example.com" });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toContain("Muitas tentativas");
  });

  it("blocks the sixth password reset request in the 15-minute window", async () => {
    const { default: app } = await import("../src/app.js");
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await request(app).post("/auth/forgot-password").send({ email: "limite-reset@example.com" });
      expect(response.status).not.toBe(429);
    }
    const blocked = await request(app).post("/auth/forgot-password").send({ email: "limite-reset@example.com" });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toContain("Muitas tentativas");
  });
});
