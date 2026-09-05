import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";

// app.ts (and everything it imports, including lib/prisma.js) is
// evaluated once per fresh import — mock Prisma before each dynamic
// import below, same as the other unit test files, since app.ts's
// module graph touches it even though these tests never call a route
// that queries the database.
vi.mock("../src/lib/prisma.js", async () => {
  const { prismaMock } = await import("./helpers/prisma-mock.js");
  return { prisma: prismaMock };
});

const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
const ORIGINAL_CORS_ORIGIN = process.env.CORS_ORIGIN;

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  if (ORIGINAL_CORS_ORIGIN === undefined) {
    delete process.env.CORS_ORIGIN;
  } else {
    process.env.CORS_ORIGIN = ORIGINAL_CORS_ORIGIN;
  }
});

describe("CORS — environment-aware allowed origins", () => {
  it("allows localhost:5173 outside production", async () => {
    process.env.NODE_ENV = "test";
    delete process.env.CORS_ORIGIN;

    const { default: app } = await import("../src/app.js");

    const res = await request(app).get("/health").set("Origin", "http://localhost:5173");

    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
  });

  it("allows the configured CORS_ORIGIN in production", async () => {
    process.env.NODE_ENV = "production";
    process.env.CORS_ORIGIN = "https://os-system-nine.vercel.app";

    const { default: app } = await import("../src/app.js");

    const res = await request(app)
      .get("/health")
      .set("Origin", "https://os-system-nine.vercel.app");

    expect(res.headers["access-control-allow-origin"]).toBe(
      "https://os-system-nine.vercel.app",
    );
  });

  it("does NOT allow localhost:5173 in production, even though it's allowed in dev", async () => {
    process.env.NODE_ENV = "production";
    process.env.CORS_ORIGIN = "https://os-system-nine.vercel.app";

    const { default: app } = await import("../src/app.js");

    const res = await request(app).get("/health").set("Origin", "http://localhost:5173");

    // The cors package surfaces a rejected origin as an error passed to
    // Express's error handling — there's no custom CORS error handler
    // here, so it falls through to Express's default (a 500), but the
    // important, stable assertion is what actually matters for security:
    // no Access-Control-Allow-Origin header is echoed back for a
    // rejected origin, so the browser won't expose the response to
    // script running on that origin regardless of the status code.
    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("throws at startup if CORS_ORIGIN is unset in production", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.CORS_ORIGIN;

    await expect(import("../src/app.js")).rejects.toThrow(
      "CORS_ORIGIN precisa estar configurado em produção",
    );
  });
});
