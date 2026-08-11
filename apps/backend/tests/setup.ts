import { beforeAll, afterAll } from "vitest";
import { prisma } from "../src/lib/prisma.js";

beforeAll(async () => {
  await prisma.$connect();
});

afterAll(async () => {
  await prisma.$disconnect();
});