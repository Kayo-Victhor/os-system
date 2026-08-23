#!/usr/bin/env node
// Pre-flight checks for `pnpm dev`, then hands off to `turbo dev` (which
// runs both apps/backend and apps/frontend's own `dev` scripts
// concurrently, prefixing each line of output with the package name).
//
// This script only CHECKS things — it never starts, stops, or restarts
// PostgreSQL itself.

import { existsSync, readFileSync } from "node:fs";
import { createConnection } from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const GREEN = "\x1b[32m";
const CYAN = "\x1b[36m";

function fail(message) {
  console.error(`${RED}${BOLD}✗${RESET} ${message}`);
}

function warn(message) {
  console.warn(`${YELLOW}${BOLD}!${RESET} ${message}`);
}

function ok(message) {
  console.log(`${GREEN}✓${RESET} ${message}`);
}

let hasBlockingError = false;

// ---------------------------------------------------------------------
// 1. Dependencies installed
// ---------------------------------------------------------------------
const nodeModulesPaths = [
  path.join(ROOT, "node_modules"),
  path.join(ROOT, "apps/backend/node_modules"),
  path.join(ROOT, "apps/frontend/node_modules"),
];

const missingNodeModules = nodeModulesPaths.filter((p) => !existsSync(p));

if (missingNodeModules.length > 0) {
  fail("Dependências não instaladas.");
  console.error(`  Rode ${BOLD}pnpm install${RESET} na raiz do projeto antes de continuar.`);
  hasBlockingError = true;
} else {
  ok("Dependências instaladas");
}

// ---------------------------------------------------------------------
// 2. Backend .env exists
// ---------------------------------------------------------------------
const backendEnvPath = path.join(ROOT, "apps/backend/.env");

if (!existsSync(backendEnvPath)) {
  fail("apps/backend/.env não encontrado.");
  console.error(
    `  Copie apps/backend/.env.example para apps/backend/.env e configure ` +
      `DATABASE_URL, JWT_ACCESS_SECRET e JWT_REFRESH_SECRET.`,
  );
  hasBlockingError = true;
} else {
  ok("apps/backend/.env encontrado");
}

if (hasBlockingError) {
  console.error(`\n${RED}${BOLD}Corrija o(s) problema(s) acima antes de rodar pnpm dev.${RESET}`);
  process.exit(1);
}

// ---------------------------------------------------------------------
// 3. PostgreSQL reachable (best-effort TCP check only — never starts,
//    stops, or restarts it; a failure here warns but doesn't block,
//    since the person may be about to start Postgres separately)
// ---------------------------------------------------------------------
function parseDatabaseUrl(envContent) {
  const match = envContent.match(/^DATABASE_URL\s*=\s*"?([^"\n]+)"?\s*$/m);
  if (!match) return null;

  try {
    const url = new URL(match[1]);
    return {
      host: url.hostname || "localhost",
      port: url.port ? Number(url.port) : 5432,
    };
  } catch {
    return null;
  }
}

function checkPostgresReachable({ host, port }, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const socket = createConnection({ host, port, timeout: timeoutMs });

    socket.once("connect", () => {
      socket.end();
      resolve(true);
    });

    socket.once("error", () => resolve(false));
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

const envContent = readFileSync(backendEnvPath, "utf8");
const dbTarget = parseDatabaseUrl(envContent);

if (!dbTarget) {
  warn("Não foi possível interpretar DATABASE_URL em apps/backend/.env — pulando verificação do PostgreSQL.");
} else {
  const reachable = await checkPostgresReachable(dbTarget);

  if (reachable) {
    ok(`PostgreSQL respondendo em ${dbTarget.host}:${dbTarget.port}`);
  } else {
    warn(
      `PostgreSQL não respondeu em ${dbTarget.host}:${dbTarget.port} ` +
        `(isso só verifica se a porta está aceitando conexões — não inicia, para ` +
        `ou reinicia o banco). Se ele ainda não estiver rodando, inicie-o antes ` +
        `de usar o sistema; o backend vai continuar tentando e reportar o erro ` +
        `de conexão normalmente caso o banco esteja indisponível.`,
    );
  }
}

// ---------------------------------------------------------------------
// Hand off to turbo — both apps start concurrently, each line prefixed
// with its package name so it's clear which service produced it.
// ---------------------------------------------------------------------
console.log(`\n${CYAN}${BOLD}Iniciando backend + frontend (pnpm dev via turbo)...${RESET}\n`);

const child = spawn("pnpm", ["exec", "turbo", "dev"], {
  cwd: ROOT,
  stdio: "inherit",
  shell: process.platform === "win32",
});

child.on("error", (err) => {
  if (err.code === "ENOENT") {
    fail("Não foi possível encontrar o executável \"pnpm\" no PATH.");
    console.error(`  Instale o pnpm (${CYAN}https://pnpm.io/installation${RESET}) e tente novamente.`);
  } else {
    fail(`Falha ao iniciar os serviços: ${err.message}`);
  }
  process.exit(1);
});

child.on("exit", (code) => process.exit(code ?? 0));
