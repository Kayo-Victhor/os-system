#!/usr/bin/env node
// Prepares the test database's schema by running `prisma migrate deploy`
// against DATABASE_URL from .env.test specifically.
//
// This exists because prisma.config.ts has `import "dotenv/config"` at its
// top, which unconditionally loads the main .env (pointing at the dev
// database) — running `prisma migrate deploy` directly from the shell
// would apply migrations to os_system, not os_system_test. This script
// forces .env.test's DATABASE_URL to take precedence before invoking the
// Prisma CLI, and re-checks the same "must contain test" safety guard
// used everywhere else in the test setup before doing anything.
//
// No dependency on the `dotenv` package here (deliberately) — just a
// small regex read of the one line we need, same approach as
// scripts/dev-check.mjs at the repo root.

import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const RESET = "\x1b[0m";
const RED = "\x1b[31m";
const BOLD = "\x1b[1m";
const GREEN = "\x1b[32m";

if (!existsSync(".env.test")) {
  console.error(`${RED}${BOLD}✗${RESET} apps/backend/.env.test não encontrado.`);
  console.error("  Copie .env.test.example para .env.test e configure um banco de testes dedicado.");
  process.exit(1);
}

const envContent = readFileSync(".env.test", "utf8");
const match = envContent.match(/^DATABASE_URL\s*=\s*"?([^"\n\r]+)"?\s*$/m);
const databaseUrl = match ? match[1] : undefined;

if (!databaseUrl) {
  console.error(`${RED}${BOLD}✗${RESET} DATABASE_URL não definida em .env.test.`);
  process.exit(1);
}

if (!/test/i.test(databaseUrl)) {
  console.error(
    `${RED}${BOLD}✗${RESET} Recusando rodar migrations: a DATABASE_URL em .env.test não ` +
      'contém "test". Isso nunca deve apontar para o banco de desenvolvimento (os_system) ' +
      "ou produção.",
  );
  process.exit(1);
}

// Force this value regardless of whatever prisma.config.ts's
// `dotenv/config` (which loads the main .env) sets — this is the whole
// point of the script.
const env = { ...process.env, DATABASE_URL: databaseUrl };
const redacted = databaseUrl.replace(/:[^:@/]+@/, ":****@");

console.log(`Aplicando migrations em: ${redacted}\n`);

const result = spawnSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
  stdio: "inherit",
  env,
  shell: process.platform === "win32",
});

if (result.error) {
  console.error(`${RED}${BOLD}✗${RESET} Falha ao executar: ${result.error.message}`);
  process.exit(1);
}

if (result.status === 0) {
  console.log(`\n${GREEN}✓${RESET} Banco de testes pronto.`);
}

process.exit(result.status ?? 1);
