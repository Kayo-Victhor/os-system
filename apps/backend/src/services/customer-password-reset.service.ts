import { prisma } from "../lib/prisma.js";
import { normalizeEmail } from "../lib/email.js";
import { hashPassword } from "../lib/password.js";
import {
  CUSTOMER_ACCOUNT_PASSWORD_RESET_TOKEN_TTL_SECONDS,
  generateCustomerAccountPasswordResetToken,
  hashCustomerAccountPasswordResetToken,
} from "../lib/tokens.js";
import { enqueueLinkEmail } from "./email-outbox.service.js";

interface LockedCustomerPasswordReset {
  id: string;
  customerAccountId: string;
  expiresAt: Date;
  usedAt: Date | null;
  status: "ACTIVE" | "SUSPENDED";
  emailVerifiedAt: Date | null;
}

interface CustomerPasswordResetCandidate {
  customerAccountId: string;
}

export async function requestCustomerAccountPasswordReset(
  emailInput: string,
): Promise<boolean> {
  const email = normalizeEmail(emailInput);
  const account = await prisma.customerAccount.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      status: true,
      emailVerifiedAt: true,
    },
  });

  // Password reset proves control of an e-mail; it must not become an
  // alternative to the registration confirmation or unsuspend an account.
  if (
    !account ||
    account.status !== "ACTIVE" ||
    !account.emailVerifiedAt
  ) {
    return false;
  }

  const { token, tokenHash } = generateCustomerAccountPasswordResetToken();
  const expiresAt = new Date(
    Date.now() + CUSTOMER_ACCOUNT_PASSWORD_RESET_TOKEN_TTL_SECONDS * 1000,
  );

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`
      SELECT "id"
      FROM "CustomerAccount"
      WHERE "id" = ${account.id}
      FOR UPDATE
    `;
    const currentAccount = await tx.customerAccount.findUnique({
      where: { id: account.id },
      select: { email: true, status: true, emailVerifiedAt: true },
    });
    if (
      !currentAccount ||
      currentAccount.status !== "ACTIVE" ||
      !currentAccount.emailVerifiedAt
    ) {
      return false;
    }

    const resetToken = await tx.customerAccountPasswordResetToken.upsert({
      where: { customerAccountId: account.id },
      update: { tokenHash, expiresAt, usedAt: null, createdAt: new Date() },
      create: { customerAccountId: account.id, tokenHash, expiresAt },
      select: { id: true },
    });
    await enqueueLinkEmail({
      tx,
      type: "CUSTOMER_PASSWORD_RESET",
      recipient: currentAccount.email,
      token,
      tokenHash,
      relatedEntityId: resetToken.id,
    });
    return true;
  });
}

export async function resetCustomerAccountPassword(
  token: string,
  password: string,
): Promise<boolean> {
  const tokenHash = hashCustomerAccountPasswordResetToken(token);
  // Argon2 is intentionally executed before opening the transaction so a
  // slow password hash does not hold a database row lock unnecessarily.
  const passwordHash = await hashPassword(password);

  return prisma.$transaction(async (tx) => {
    const [candidate] = await tx.$queryRaw<CustomerPasswordResetCandidate[]>`
      SELECT "customerAccountId"
      FROM "CustomerAccountPasswordResetToken"
      WHERE "tokenHash" = ${tokenHash}
    `;
    if (!candidate) return false;

    await tx.$queryRaw`
      SELECT "id"
      FROM "CustomerAccount"
      WHERE "id" = ${candidate.customerAccountId}
      FOR UPDATE
    `;

    const [stored] = await tx.$queryRaw<LockedCustomerPasswordReset[]>`
      SELECT
        reset_token."id",
        reset_token."customerAccountId",
        reset_token."expiresAt",
        reset_token."usedAt",
        account."status",
        account."emailVerifiedAt"
      FROM "CustomerAccountPasswordResetToken" AS reset_token
      INNER JOIN "CustomerAccount" AS account
        ON account."id" = reset_token."customerAccountId"
      WHERE reset_token."tokenHash" = ${tokenHash}
      FOR UPDATE OF reset_token
    `;

    const now = new Date();
    if (
      !stored ||
      stored.usedAt ||
      stored.expiresAt <= now ||
      stored.status !== "ACTIVE" ||
      !stored.emailVerifiedAt
    ) {
      return false;
    }

    await tx.customerAccount.update({
      where: { id: stored.customerAccountId },
      data: { passwordHash },
    });
    await tx.customerAccountPasswordResetToken.update({
      where: { id: stored.id },
      data: { usedAt: now },
    });
    await tx.customerSession.updateMany({
      where: { customerAccountId: stored.customerAccountId, revokedAt: null },
      data: { revokedAt: now },
    });

    // Legacy User RefreshToken remains deliberately untouched because it
    // belongs to an independent identity domain.
    return true;
  });
}
