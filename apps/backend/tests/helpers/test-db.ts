import { prisma } from "../../src/lib/prisma.js";

/**
 * Same check as tests/setup.ts, re-run immediately before the destructive
 * operation rather than trusting that setup.ts already ran and wasn't
 * bypassed. Cheap, and this is exactly the kind of check worth being
 * paranoid about.
 */
export function assertTestDatabase() {
  const databaseUrl = process.env.DATABASE_URL ?? "";

  if (!/test/i.test(databaseUrl)) {
    throw new Error(
      "Recusando operação destrutiva: DATABASE_URL não aponta para um " +
        "banco de testes. resetDatabase() foi chamado com uma configuração " +
        "que não parece segura — abortando antes de apagar qualquer dado.",
    );
  }
}

/**
 * Deletes all rows from every table, in FK-safe dependency order
 * (children before parents). Called before each integration test so
 * tests don't leak fixtures into each other. Truncating rather than
 * relying on per-test transaction rollback is a deliberate simplicity
 * trade-off: the app's controllers use the shared `prisma` singleton
 * directly rather than an injectable transaction client, so true
 * per-test transactional isolation would require restructuring how
 * every service takes its Prisma client — not justified for this.
 */
export async function resetDatabase() {
  assertTestDatabase();

  await prisma.refreshToken.deleteMany();
  await prisma.serviceOrder.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.user.deleteMany();
}

export { prisma as testPrisma };
