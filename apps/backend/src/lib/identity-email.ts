import type { Prisma } from "../generated/prisma/client.js";
import { normalizeEmail } from "./email.js";

/**
 * Serializes identity creation and e-mail changes across the internal User
 * and CustomerAccount tables. PostgreSQL uniqueness cannot span two tables,
 * so both domains take the same transaction-scoped advisory lock before
 * checking for a cross-domain conflict.
 */
export async function lockIdentityEmail(
  tx: Prisma.TransactionClient,
  emailInput: string,
) {
  const email = normalizeEmail(emailInput);
  await tx.$queryRaw`
    SELECT pg_advisory_xact_lock(hashtextextended(${email}, 0))::text AS lock
  `;
  return email;
}
