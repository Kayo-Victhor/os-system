function positiveInteger(name: string, fallback: number) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;

  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} deve ser um número inteiro positivo`);
  }
  return parsed;
}

export function emailOutboxConfig() {
  return {
    pollIntervalMs: positiveInteger("EMAIL_OUTBOX_POLL_INTERVAL_MS", 5_000),
    batchSize: positiveInteger("EMAIL_OUTBOX_BATCH_SIZE", 10),
    maxAttempts: positiveInteger("EMAIL_OUTBOX_MAX_ATTEMPTS", 5),
    backoffBaseMs: positiveInteger("EMAIL_OUTBOX_BACKOFF_BASE_MS", 5_000),
  };
}

export const EMAIL_OUTBOX_CLAIM_LEASE_MS = 60_000;
export const EMAIL_OUTBOX_MAX_BACKOFF_MS = 60 * 60 * 1_000;
