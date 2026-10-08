import {
  EMAIL_OUTBOX_CLAIM_LEASE_MS,
  EMAIL_OUTBOX_MAX_BACKOFF_MS,
  emailOutboxConfig,
} from "../config/email-outbox.js";
import { prisma } from "../lib/prisma.js";
import {
  hashCustomerAccountPasswordResetToken,
  hashPasswordResetToken,
  hashPendingCustomerRegistrationToken,
} from "../lib/tokens.js";
import {
  EmailDeliveryError,
  sendCustomerAccountPasswordResetEmail,
  sendCustomerRegistrationVerificationEmail,
  sendPasswordResetEmail,
} from "./email.service.js";

type OutboxType =
  | "CUSTOMER_REGISTRATION_VERIFICATION"
  | "CUSTOMER_PASSWORD_RESET"
  | "INTERNAL_PASSWORD_RESET";

interface ClaimedEmailOutbox {
  id: string;
  type: OutboxType;
  recipient: string;
  payload: unknown;
  attempts: number;
  relatedEntityId: string;
}

export interface EmailOutboxBatchResult {
  claimed: number;
  sent: number;
  failed: number;
  retried: number;
  skipped: number;
}

function payloadToken(payload: unknown) {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "token" in payload &&
    typeof payload.token === "string"
  ) {
    return payload.token;
  }
  return null;
}

async function claimBatch(batchSize: number) {
  return prisma.$transaction((tx) => tx.$queryRaw<ClaimedEmailOutbox[]>`
    WITH candidates AS (
      SELECT "id"
      FROM "EmailOutbox"
      WHERE (
        ("status" = 'PENDING' AND "availableAt" <= NOW())
        OR (
          "status" = 'PROCESSING'
          AND "claimedAt" < NOW() - (${EMAIL_OUTBOX_CLAIM_LEASE_MS} * INTERVAL '1 millisecond')
        )
      )
      ORDER BY "availableAt" ASC, "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${batchSize}
    )
    UPDATE "EmailOutbox" AS event
    SET
      "status" = 'PROCESSING',
      "claimedAt" = NOW(),
      "attempts" = event."attempts" + 1,
      "updatedAt" = NOW(),
      "lastError" = NULL
    FROM candidates
    WHERE event."id" = candidates."id"
    RETURNING
      event."id",
      event."type",
      event."recipient",
      event."payload",
      event."attempts",
      event."relatedEntityId"
  `);
}

async function eventIsCurrent(event: ClaimedEmailOutbox, token: string) {
  const now = new Date();

  if (event.type === "CUSTOMER_REGISTRATION_VERIFICATION") {
    const stored = await prisma.pendingCustomerRegistrationToken.findUnique({
      where: { id: event.relatedEntityId },
      include: { pendingRegistration: { select: { expiresAt: true } } },
    });
    return Boolean(
      stored &&
        stored.tokenHash === hashPendingCustomerRegistrationToken(token) &&
        stored.expiresAt > now &&
        stored.pendingRegistration.expiresAt > now,
    );
  }

  if (event.type === "CUSTOMER_PASSWORD_RESET") {
    const stored = await prisma.customerAccountPasswordResetToken.findUnique({
      where: { id: event.relatedEntityId },
      select: { tokenHash: true, expiresAt: true, usedAt: true },
    });
    return Boolean(
      stored &&
        !stored.usedAt &&
        stored.expiresAt > now &&
        stored.tokenHash === hashCustomerAccountPasswordResetToken(token),
    );
  }

  const stored = await prisma.passwordResetToken.findUnique({
    where: { id: event.relatedEntityId },
    select: { tokenHash: true, expiresAt: true, usedAt: true },
  });
  return Boolean(
    stored &&
      !stored.usedAt &&
      stored.expiresAt > now &&
      stored.tokenHash === hashPasswordResetToken(token),
  );
}

async function deliver(event: ClaimedEmailOutbox, token: string) {
  if (event.type === "CUSTOMER_REGISTRATION_VERIFICATION") {
    return sendCustomerRegistrationVerificationEmail({ to: event.recipient, token });
  }
  if (event.type === "CUSTOMER_PASSWORD_RESET") {
    return sendCustomerAccountPasswordResetEmail({ to: event.recipient, token });
  }
  return sendPasswordResetEmail({ to: event.recipient, token });
}

async function markFailed(event: ClaimedEmailOutbox, code: string) {
  await prisma.emailOutbox.updateMany({
    where: { id: event.id, status: "PROCESSING" },
    data: { status: "FAILED", claimedAt: null, lastError: code },
  });
}

async function processEvent(
  event: ClaimedEmailOutbox,
  config: ReturnType<typeof emailOutboxConfig>,
): Promise<keyof Omit<EmailOutboxBatchResult, "claimed">> {
  const token = payloadToken(event.payload);
  if (!token || !(await eventIsCurrent(event, token))) {
    await markFailed(event, "STALE_OR_INVALID_TOKEN");
    return "skipped";
  }

  try {
    const result = await deliver(event, token);
    await prisma.emailOutbox.updateMany({
      where: { id: event.id, status: "PROCESSING" },
      data: {
        status: "SENT",
        claimedAt: null,
        sentAt: new Date(),
        providerMessageId: result.providerMessageId,
        lastError: null,
      },
    });
    console.info("E-mail da outbox enviado", {
      eventId: event.id,
      type: event.type,
      attempt: event.attempts,
      providerMessageId: result.providerMessageId,
    });
    return "sent";
  } catch (error) {
    const deliveryError = error instanceof EmailDeliveryError
      ? error
      : new EmailDeliveryError(true, "EMAIL_OUTBOX_WORKER_ERROR");
    const retryable = deliveryError.retryable && event.attempts < config.maxAttempts;

    if (!retryable) {
      await markFailed(event, deliveryError.code);
      console.error("E-mail da outbox falhou permanentemente", {
        eventId: event.id,
        type: event.type,
        attempt: event.attempts,
        code: deliveryError.code,
      });
      return "failed";
    }

    const backoffMs = Math.min(
      config.backoffBaseMs * (2 ** Math.max(0, event.attempts - 1)),
      EMAIL_OUTBOX_MAX_BACKOFF_MS,
    );
    await prisma.emailOutbox.updateMany({
      where: { id: event.id, status: "PROCESSING" },
      data: {
        status: "PENDING",
        claimedAt: null,
        availableAt: new Date(Date.now() + backoffMs),
        lastError: deliveryError.code,
      },
    });
    console.warn("E-mail da outbox reagendado", {
      eventId: event.id,
      type: event.type,
      attempt: event.attempts,
      code: deliveryError.code,
    });
    return "retried";
  }
}

export async function processEmailOutboxBatch(): Promise<EmailOutboxBatchResult> {
  const config = emailOutboxConfig();
  const events = await claimBatch(config.batchSize);
  const result: EmailOutboxBatchResult = {
    claimed: events.length,
    sent: 0,
    failed: 0,
    retried: 0,
    skipped: 0,
  };

  // A claimed batch is delivered concurrently. With the provider's bounded
  // 10-second timeout this keeps every claim comfortably inside the 60-second
  // lease, including the last item in the batch.
  const outcomes = await Promise.all(
    events.map((event) => processEvent(event, config)),
  );
  for (const outcome of outcomes) {
    result[outcome] += 1;
  }
  return result;
}

let workerTimer: NodeJS.Timeout | undefined;
let currentCycle: Promise<void> | undefined;
let workerStopping = false;

function scheduleNextCycle() {
  if (workerStopping || workerTimer) return;
  workerTimer = setTimeout(() => {
    workerTimer = undefined;
    if (workerStopping) return;
    currentCycle = processEmailOutboxBatch()
      .then(() => undefined)
      .catch((error) => {
        console.error("Falha no ciclo da outbox de e-mail", {
          error: error instanceof Error ? error.name : "erro desconhecido",
        });
      })
      .finally(() => {
        currentCycle = undefined;
        scheduleNextCycle();
      });
  }, emailOutboxConfig().pollIntervalMs);
  workerTimer.unref();
}

export function startEmailOutboxWorker() {
  if (process.env.NODE_ENV === "test" || workerTimer || currentCycle) return;
  workerStopping = false;
  scheduleNextCycle();
}

export function isEmailOutboxWorkerRunning() {
  return !workerStopping && Boolean(workerTimer || currentCycle);
}

export async function stopEmailOutboxWorker() {
  workerStopping = true;
  if (workerTimer) clearTimeout(workerTimer);
  workerTimer = undefined;
  await currentCycle;
}
