import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ENV_PATH = resolve(ROOT_DIR, "apps/backend/.env.test");
const LOCAL_DATABASE_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function parseEnvFile(source) {
  const result = {};

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const normalized = line.startsWith("export ") ? line.slice(7) : line;
    const separator = normalized.indexOf("=");
    if (separator <= 0) continue;

    const key = normalized.slice(0, separator).trim();
    let value = normalized.slice(separator + 1).trim();

    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

export function loadE2EEnvironment() {
  if (!existsSync(ENV_PATH)) {
    throw new Error(
      "apps/backend/.env.test não foi encontrado. Copie .env.test.example e configure os_system_test antes do E2E.",
    );
  }

  const fileEnvironment = parseEnvFile(readFileSync(ENV_PATH, "utf8"));
  const databaseUrl = fileEnvironment.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL não está definida em apps/backend/.env.test.");
  }

  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL de apps/backend/.env.test não é uma URL PostgreSQL válida.");
  }

  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new Error("A suíte E2E exige uma DATABASE_URL PostgreSQL.");
  }
  if (!LOCAL_DATABASE_HOSTS.has(parsed.hostname)) {
    throw new Error(
      `Recusando E2E: o host do banco deve ser local; recebido ${parsed.hostname}.`,
    );
  }
  if (!database.endsWith("_test")) {
    throw new Error(
      `Recusando E2E: o banco deve terminar com _test; recebido ${database || "(vazio)"}.`,
    );
  }

  const environment = {
    ...process.env,
    ...fileEnvironment,
    NODE_ENV: "test",
    CORS_ORIGIN: "http://127.0.0.1:5173",
    ALLOW_DIRECT_API_REQUESTS: "true",
    INTERNAL_PROXY_SECRET:
      "e2e-local-proxy-secret-with-at-least-32-bytes",
    EMAIL_VERIFICATION_SECRET:
      "e2e-email-verification-secret-not-for-real-use",
    PASSWORD_RESET_SECRET: "e2e-password-reset-secret-not-for-real-use",
    DOTENV_CONFIG_PATH: ENV_PATH,
    DOTENV_CONFIG_OVERRIDE: "false",
  };

  return {
    rootDir: ROOT_DIR,
    envPath: ENV_PATH,
    environment,
    database: {
      host: parsed.hostname,
      port: parsed.port || "5432",
      name: database,
    },
  };
}

export function applyE2EEnvironment() {
  const config = loadE2EEnvironment();
  Object.assign(process.env, config.environment);
  return config;
}
