import dotenv from "dotenv";

// Loaded relative to CWD (apps/backend, where vitest runs from) — same
// convention as prisma/seed.ts's `import "dotenv/config"` for the main
// .env. dotenv does NOT override a variable that's already set in
// process.env, so this never clobbers the JWT_* secrets vitest.config.ts
// sets directly.
dotenv.config({ path: ".env.test" });

// ---------------------------------------------------------------------
// Safety guard: refuse to run ANY test if DATABASE_URL doesn't look like
// a dedicated test database. This runs unconditionally, for every test
// file (setupFiles execute before each test file), before any test has a
// chance to call resetDatabase() or otherwise touch the database. It is
// intentionally a hard crash, not a warning — the whole point is that a
// misconfigured DATABASE_URL must never silently proceed.
//
// tests/helpers/test-db.ts re-checks this same condition immediately
// before its destructive resetDatabase() call too, so a test file that
// somehow bypassed this setup file (or a future refactor that changes
// how setup runs) doesn't lose the protection.
// ---------------------------------------------------------------------
const databaseUrl = process.env.DATABASE_URL ?? "";
const looksLikeTestDatabase = /test/i.test(databaseUrl);

if (!looksLikeTestDatabase) {
  const redacted = databaseUrl
    ? databaseUrl.replace(/:[^:@/]+@/, ":****@")
    : "(não definida)";

  throw new Error(
    "Recusando executar os testes: DATABASE_URL não aponta para um banco " +
      'de testes (o nome do banco precisa conter "test"). ' +
      `Valor atual: ${redacted}\n\n` +
      "Os testes NUNCA devem rodar contra o banco de desenvolvimento " +
      "(os_system) ou qualquer banco de produção — eles apagam todos os " +
      "dados antes de cada teste.\n\n" +
      "Copie apps/backend/.env.test.example para apps/backend/.env.test " +
      "e configure um banco dedicado, ex: " +
      "postgresql://usuario:senha@localhost:5432/os_system_test",
  );
}
