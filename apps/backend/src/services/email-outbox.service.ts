import type { Prisma } from "../generated/prisma/client.js";

type OutboxTransaction = Prisma.TransactionClient;

interface EnqueueEmailInput {
  tx: OutboxTransaction;
  type:
    | "CUSTOMER_REGISTRATION_VERIFICATION"
    | "CUSTOMER_PASSWORD_RESET"
    | "INTERNAL_PASSWORD_RESET";
  recipient: string;
  token: string;
  tokenHash: string;
  relatedEntityId: string;
}

/**
 * Adds one logical delivery to the same transaction as its token. The token
 * HMAC participates in the unique key, so retrying the same business event is
 * idempotent while a genuine token rotation creates a new delivery.
 */
export async function enqueueLinkEmail({
  tx,
  type,
  recipient,
  token,
  tokenHash,
  relatedEntityId,
}: EnqueueEmailInput) {
  await tx.emailOutbox.updateMany({
    where: {
      type,
      relatedEntityId,
      status: { in: ["PENDING", "PROCESSING"] },
    },
    data: {
      status: "FAILED",
      claimedAt: null,
      lastError: "SUPERSEDED_TOKEN",
    },
  });

  return tx.emailOutbox.upsert({
    where: { deduplicationKey: `${type}:${relatedEntityId}:${tokenHash}` },
    update: {},
    create: {
      type,
      recipient,
      payload: { token },
      relatedEntityId,
      deduplicationKey: `${type}:${relatedEntityId}:${tokenHash}`,
    },
    select: { id: true },
  });
}
