import { prisma } from "../lib/prisma.js";
import { normalizeEmail } from "../lib/email.js";
import { hashPassword } from "../lib/password.js";
import { lockIdentityEmail } from "../lib/identity-email.js";
import {
  generatePendingCustomerRegistrationToken,
  hashPendingCustomerRegistrationToken,
  PENDING_CUSTOMER_REGISTRATION_TOKEN_TTL_SECONDS,
  PENDING_CUSTOMER_REGISTRATION_TTL_SECONDS,
} from "../lib/tokens.js";
import type { RegisterInput } from "../schemas/user.schema.js";
import {
  EmailDeliveryError,
  sendCustomerRegistrationVerificationEmail,
} from "./email.service.js";

export const CUSTOMER_REGISTRATION_MESSAGE =
  "Se os dados forem válidos, enviaremos um e-mail para confirmação.";

export type CustomerRegistrationConfirmationResult = "CONFIRMED" | "INVALID";

interface LockedPendingRegistration {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  phone: string | null;
  document: string | null;
  address: string | null;
  pendingExpiresAt: Date;
  tokenExpiresAt: Date;
}

async function hasIdentityConflict(email: string, document?: string) {
  const [user, customerAccount, customerWithDocument] = await Promise.all([
    prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true },
    }),
    prisma.customerAccount.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true },
    }),
    document
      ? prisma.customer.findUnique({ where: { document }, select: { id: true } })
      : Promise.resolve(null),
  ]);

  return Boolean(user || customerAccount || customerWithDocument);
}

async function invalidateUndeliveredToken(
  pendingRegistrationId: string,
  tokenHash: string,
) {
  await prisma.pendingCustomerRegistrationToken.deleteMany({
    where: { pendingRegistrationId, tokenHash },
  });
}

export async function requestCustomerRegistration(data: RegisterInput): Promise<boolean> {
  const email = normalizeEmail(data.email);
  const [identityConflict, passwordHash] = await Promise.all([
    hasIdentityConflict(email, data.document),
    hashPassword(data.password),
  ]);
  if (identityConflict) return false;
  const { token, tokenHash } = generatePendingCustomerRegistrationToken();
  const now = Date.now();
  const pendingExpiresAt = new Date(
    now + PENDING_CUSTOMER_REGISTRATION_TTL_SECONDS * 1000,
  );
  const tokenExpiresAt = new Date(
    now + PENDING_CUSTOMER_REGISTRATION_TOKEN_TTL_SECONDS * 1000,
  );

  const pending = await prisma.$transaction(async (tx) => {
    const registration = await tx.pendingCustomerRegistration.upsert({
      where: { email },
      update: {
        name: data.name,
        passwordHash,
        phone: data.phone,
        document: data.document,
        address: data.address,
        expiresAt: pendingExpiresAt,
      },
      create: {
        name: data.name,
        email,
        passwordHash,
        phone: data.phone,
        document: data.document,
        address: data.address,
        expiresAt: pendingExpiresAt,
      },
      select: { id: true, email: true },
    });

    await tx.pendingCustomerRegistrationToken.upsert({
      where: { pendingRegistrationId: registration.id },
      update: { tokenHash, expiresAt: tokenExpiresAt, createdAt: new Date() },
      create: {
        pendingRegistrationId: registration.id,
        tokenHash,
        expiresAt: tokenExpiresAt,
      },
    });

    return registration;
  });

  try {
    await sendCustomerRegistrationVerificationEmail({ to: pending.email, token });
  } catch (error) {
    await invalidateUndeliveredToken(pending.id, tokenHash);
    if (error instanceof EmailDeliveryError) throw error;
    throw new EmailDeliveryError();
  }

  return true;
}

export async function resendCustomerRegistration(emailInput: string): Promise<boolean> {
  const email = normalizeEmail(emailInput);
  if (await hasIdentityConflict(email)) return false;

  const pending = await prisma.pendingCustomerRegistration.findFirst({
    where: { email, expiresAt: { gt: new Date() } },
    select: { id: true, email: true },
  });
  if (!pending) return false;

  const { token, tokenHash } = generatePendingCustomerRegistrationToken();
  const tokenExpiresAt = new Date(
    Date.now() + PENDING_CUSTOMER_REGISTRATION_TOKEN_TTL_SECONDS * 1000,
  );

  await prisma.$transaction((tx) =>
    tx.pendingCustomerRegistrationToken.upsert({
      where: { pendingRegistrationId: pending.id },
      update: { tokenHash, expiresAt: tokenExpiresAt, createdAt: new Date() },
      create: {
        pendingRegistrationId: pending.id,
        tokenHash,
        expiresAt: tokenExpiresAt,
      },
    }),
  );

  try {
    await sendCustomerRegistrationVerificationEmail({ to: pending.email, token });
  } catch (error) {
    await invalidateUndeliveredToken(pending.id, tokenHash);
    if (error instanceof EmailDeliveryError) throw error;
    throw new EmailDeliveryError();
  }

  return true;
}

export async function isPendingCustomerRegistrationTokenValid(token: string) {
  const tokenHash = hashPendingCustomerRegistrationToken(token);
  const now = new Date();
  const stored = await prisma.pendingCustomerRegistrationToken.findUnique({
    where: { tokenHash },
    include: { pendingRegistration: { select: { expiresAt: true } } },
  });

  return Boolean(
    stored &&
      stored.expiresAt > now &&
      stored.pendingRegistration.expiresAt > now,
  );
}

/**
 * Converts one pending registration into exactly one Customer identity.
 *
 * PostgreSQL locks both the token and its pending row before validating them.
 * A concurrent request for the same HMAC therefore waits for the first one;
 * after that transaction deletes the pending row, the waiting query observes
 * no row and cannot create a second identity. Database unique constraints are
 * the second line of defence for account e-mail, document and customerId.
 */
export async function confirmCustomerRegistration(
  token: string,
): Promise<CustomerRegistrationConfirmationResult> {
  const tokenHash = hashPendingCustomerRegistrationToken(token);

  return prisma.$transaction(async (tx) => {
    const [pending] = await tx.$queryRaw<LockedPendingRegistration[]>`
      SELECT
        pending."id",
        pending."name",
        pending."email",
        pending."passwordHash",
        pending."phone",
        pending."document",
        pending."address",
        pending."expiresAt" AS "pendingExpiresAt",
        registration_token."expiresAt" AS "tokenExpiresAt"
      FROM "PendingCustomerRegistrationToken" AS registration_token
      INNER JOIN "PendingCustomerRegistration" AS pending
        ON pending."id" = registration_token."pendingRegistrationId"
      WHERE registration_token."tokenHash" = ${tokenHash}
      FOR UPDATE OF registration_token, pending
    `;

    const now = new Date();
    if (
      !pending ||
      pending.tokenExpiresAt <= now ||
      pending.pendingExpiresAt <= now
    ) {
      return "INVALID";
    }

    const email = await lockIdentityEmail(tx, pending.email);
    const [userConflict, accountConflict, documentConflict] = await Promise.all([
      tx.user.findFirst({
        where: { email: { equals: email, mode: "insensitive" } },
        select: { id: true },
      }),
      tx.customerAccount.findFirst({
        where: { email: { equals: email, mode: "insensitive" } },
        select: { id: true },
      }),
      pending.document
        ? tx.customer.findUnique({
            where: { document: pending.document },
            select: { id: true },
          })
        : Promise.resolve(null),
    ]);
    if (userConflict || accountConflict || documentConflict) return "INVALID";

    const customer = await tx.customer.create({
      data: {
        name: pending.name,
        email: pending.email,
        phone: pending.phone,
        document: pending.document,
        address: pending.address,
      },
      select: { id: true },
    });

    await tx.customerAccount.create({
      data: {
        customerId: customer.id,
        email: pending.email,
        passwordHash: pending.passwordHash,
        emailVerifiedAt: now,
        status: "ACTIVE",
      },
    });

    // The FK uses ON DELETE CASCADE, so consuming the pending registration
    // removes its only current token in the same atomic transaction.
    await tx.pendingCustomerRegistration.delete({ where: { id: pending.id } });

    return "CONFIRMED";
  });
}
