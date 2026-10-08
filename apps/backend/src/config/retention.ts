function positiveInteger(name: string, fallback: number) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;

  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} deve ser um número inteiro positivo`);
  }
  return parsed;
}

export const PENDING_REGISTRATION_RETENTION_MS = 60 * 60 * 1_000;
export const TOKEN_RETENTION_MS = 24 * 60 * 60 * 1_000;
export const SESSION_RETENTION_MS = 24 * 60 * 60 * 1_000;

export function cleanupConfig() {
  return {
    pollIntervalMs: positiveInteger("CLEANUP_POLL_INTERVAL_MS", 60 * 60 * 1_000),
    batchSize: positiveInteger("CLEANUP_BATCH_SIZE", 100),
  };
}
