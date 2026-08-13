import { vi } from "vitest";
import "./helpers/prisma-mock.js";

// The whole suite runs against the mocked Prisma client from
// tests/helpers/prisma-mock.ts — no live database connection is made here.
// This keeps tests fast, deterministic, and runnable in CI/sandboxes
// without provisioning Postgres, at the cost of not exercising real SQL
// (constraints, cascades, etc). That trade-off should be revisited with a
// docker-compose based integration suite before this goes to production.

vi.mock("../src/lib/prisma.js", async () => {
  const { prismaMock } = await import("./helpers/prisma-mock.js");
  return { prisma: prismaMock };
});
