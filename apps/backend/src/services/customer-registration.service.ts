import { prisma } from "../lib/prisma.js";
import { normalizeEmail } from "../lib/email.js";
import { hashPassword } from "../lib/password.js";
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
