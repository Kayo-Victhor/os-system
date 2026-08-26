import dotenv from "dotenv";

// Loaded relative to CWD (apps/backend, where vitest runs from) — same
// convention as prisma/seed.ts's `import "dotenv/config"` for the main
// .env. override: true is deliberate here (unlike dotenv's default):
// .env.test must always win over anything already in the environment
// when tests run, or an ambient DATABASE_URL (e.g. exported in a shell
// profile) could silently take precedence over the test config the
// person just set up. The safety guard below is the real backstop
// either way — this is about making .env.test's value predictable, not
// about safety.
dotenv.config({ path: ".env.test", override: true });

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

// ---------------------------------------------------------------------
// Verifiable confirmation, printed to stdout on every test file (not
// just asserted in a comment): exactly which host/database the suite is
// about to use. Credentials are redacted; host/port/database name are
// not secrets and are the whole point of printing this. Check this
// output directly rather than assuming the guard above did its job —
// e.g. `pnpm test 2>&1 | grep "\[test-db\]" | sort -u` should show
// exactly one line, and it should name your test database, not
// os_system.
// ---------------------------------------------------------------------
try {
  const parsed = new URL(databaseUrl);
  const dbName = parsed.pathname.replace(/^\//, "");
  console.log(`[test-db] host=${parsed.hostname} port=${parsed.port || "5432"} database=${dbName}`);
} catch {
  console.log(`[test-db] DATABASE_URL contains "test" but isn't a parseable URL: ${databaseUrl.replace(/:[^:@/]+@/, ":****@")}`);
}
