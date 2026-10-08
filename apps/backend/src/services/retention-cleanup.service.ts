import {
  cleanupConfig,
  PENDING_REGISTRATION_RETENTION_MS,
  SESSION_RETENTION_MS,
  TOKEN_RETENTION_MS,
} from "../config/retention.js";
import { prisma } from "../lib/prisma.js";

interface DeletedId {
  id: string;
}

interface DeletedSessionFamilyCount {
  sessions: bigint;
  refreshTokens: bigint;
}

interface DeletedPendingCount {
  registrations: bigint;
  confirmationTokens: bigint;
}

export interface RetentionCleanupResult {
  pendingRegistrations: number;
  confirmationTokens: number;
  customerPasswordResetTokens: number;
  customerSessions: number;
  customerSessionRefreshTokens: number;
  internalRefreshTokens: number;
  internalPasswordResetTokens: number;
}

function retentionCutoff(now: Date, retentionMs: number) {
  return new Date(now.getTime() - retentionMs);
}

/**
 * Deletes at most one configured batch from every retention category.
 *
 * Every statement claims candidates with FOR UPDATE SKIP LOCKED. Multiple
 * backend instances can therefore execute the cycle concurrently without
 * selecting the same rows or requiring a distributed coordinator.
 */
export async function runRetentionCleanupBatch(options?: {
  now?: Date;
  batchSize?: number;
}): Promise<RetentionCleanupResult> {
  const now = options?.now ?? new Date();
  const batchSize = options?.batchSize ?? cleanupConfig().batchSize;
  const pendingCutoff = retentionCutoff(now, PENDING_REGISTRATION_RETENTION_MS);
  const tokenCutoff = retentionCutoff(now, TOKEN_RETENTION_MS);
  const sessionCutoff = retentionCutoff(now, SESSION_RETENTION_MS);

  const confirmationTokens = await prisma.$queryRaw<DeletedId[]>`
    WITH candidates AS (
      SELECT "id"
      FROM "PendingCustomerRegistrationToken"
      WHERE "expiresAt" < ${pendingCutoff}
      ORDER BY "expiresAt" ASC, "id" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${batchSize}
    )
    DELETE FROM "PendingCustomerRegistrationToken" AS token
    USING candidates
    WHERE token."id" = candidates."id"
    RETURNING token."id"
  `;

  const [pendingBatch] = await prisma.$queryRaw<DeletedPendingCount[]>`
    WITH candidates AS MATERIALIZED (
      SELECT registration."id"
      FROM "PendingCustomerRegistration" AS registration
      WHERE registration."expiresAt" < ${pendingCutoff}
      ORDER BY registration."expiresAt" ASC, registration."id" ASC
      FOR UPDATE OF registration SKIP LOCKED
      LIMIT ${batchSize}
    ), token_count AS MATERIALIZED (
      SELECT COUNT(*) AS count
      FROM "PendingCustomerRegistrationToken" AS token
      INNER JOIN candidates ON candidates."id" = token."pendingRegistrationId"
    ), deleted AS (
      DELETE FROM "PendingCustomerRegistration" AS registration
      USING candidates
      WHERE registration."id" = candidates."id"
      RETURNING registration."id"
    )
    SELECT
      COUNT(deleted."id") AS registrations,
      (SELECT count FROM token_count) AS "confirmationTokens"
    FROM deleted
  `;

  const customerPasswordResetTokens = await prisma.$queryRaw<DeletedId[]>`
    WITH candidates AS (
      SELECT "id"
      FROM "CustomerAccountPasswordResetToken"
      WHERE "expiresAt" < ${tokenCutoff}
         OR ("usedAt" IS NOT NULL AND "usedAt" < ${tokenCutoff})
      ORDER BY "expiresAt" ASC, "id" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${batchSize}
    )
    DELETE FROM "CustomerAccountPasswordResetToken" AS token
    USING candidates
    WHERE token."id" = candidates."id"
    RETURNING token."id"
  `;

  const internalPasswordResetTokens = await prisma.$queryRaw<DeletedId[]>`
    WITH candidates AS (
      SELECT "id"
      FROM "PasswordResetToken"
      WHERE "expiresAt" < ${tokenCutoff}
         OR ("usedAt" IS NOT NULL AND "usedAt" < ${tokenCutoff})
      ORDER BY "expiresAt" ASC, "id" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${batchSize}
    )
    DELETE FROM "PasswordResetToken" AS token
    USING candidates
    WHERE token."id" = candidates."id"
    RETURNING token."id"
  `;

  // A customer refresh-token ancestor is evidence used to detect replay.
  // It is never removed independently: the complete family is retained until
  // its parent session has expired (and, when revoked, passed both cutoffs).
  const [customerSessionFamilies] = await prisma.$queryRaw<
    DeletedSessionFamilyCount[]
  >`
    WITH candidates AS MATERIALIZED (
      SELECT session."id"
      FROM "CustomerSession" AS session
      WHERE session."expiresAt" < ${sessionCutoff}
        AND (session."revokedAt" IS NULL OR session."revokedAt" < ${sessionCutoff})
      ORDER BY session."expiresAt" ASC, session."id" ASC
      FOR UPDATE OF session SKIP LOCKED
      LIMIT ${batchSize}
    ), refresh_count AS MATERIALIZED (
      SELECT COUNT(*) AS count
      FROM "CustomerSessionRefreshToken" AS refresh_token
      INNER JOIN candidates ON candidates."id" = refresh_token."customerSessionId"
    ), deleted AS (
      DELETE FROM "CustomerSession" AS session
      USING candidates
      WHERE session."id" = candidates."id"
      RETURNING session."id"
    )
    SELECT
      COUNT(deleted."id") AS sessions,
      (SELECT count FROM refresh_count) AS "refreshTokens"
    FROM deleted
  `;

  // A revoked internal refresh token is likewise kept through its original
  // validity window plus retention so reuse remains observable.
  const internalRefreshTokens = await prisma.$queryRaw<DeletedId[]>`
    WITH candidates AS (
      SELECT "id"
      FROM "RefreshToken"
      WHERE "expiresAt" < ${tokenCutoff}
        AND ("revokedAt" IS NULL OR "revokedAt" < ${tokenCutoff})
      ORDER BY "expiresAt" ASC, "id" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${batchSize}
    )
    DELETE FROM "RefreshToken" AS token
    USING candidates
    WHERE token."id" = candidates."id"
    RETURNING token."id"
  `;

  return {
    pendingRegistrations: Number(pendingBatch?.registrations ?? 0n),
    confirmationTokens:
      confirmationTokens.length + Number(pendingBatch?.confirmationTokens ?? 0n),
    customerPasswordResetTokens: customerPasswordResetTokens.length,
    customerSessions: Number(customerSessionFamilies?.sessions ?? 0n),
    customerSessionRefreshTokens: Number(
      customerSessionFamilies?.refreshTokens ?? 0n,
    ),
    internalRefreshTokens: internalRefreshTokens.length,
    internalPasswordResetTokens: internalPasswordResetTokens.length,
  };
}
