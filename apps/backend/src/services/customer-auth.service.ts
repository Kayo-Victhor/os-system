import { prisma } from "../lib/prisma.js";
import { normalizeEmail } from "../lib/email.js";
import { verifyPassword } from "../lib/password.js";
import {
  CUSTOMER_SESSION_TTL_SECONDS,
  generateCustomerSessionRefreshToken,
  hashCustomerSessionRefreshToken,
  signCustomerAccessToken,
  verifyCustomerAccessToken,
} from "../lib/tokens.js";
import type { CustomerLoginInput } from "../schemas/auth.schema.js";

const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

export interface CustomerSessionResult {
  accessToken: string;
  refreshToken: string;
  customerAccount: {
    id: string;
    email: string;
    customer: {
      id: string;
      name: string;
      email: string | null;
      phone: string | null;
      document: string | null;
      address: string | null;
    };
  };
}

interface LockedCustomerRefreshToken {
  id: string;
  customerSessionId: string;
  customerAccountId: string;
  email: string;
  status: "ACTIVE" | "SUSPENDED";
  emailVerifiedAt: Date | null;
  tokenExpiresAt: Date;
  consumedAt: Date | null;
  sessionExpiresAt: Date;
  revokedAt: Date | null;
}

interface CustomerRefreshCandidate {
  customerAccountId: string;
}

interface LockedCustomerLogin {
  id: string;
  passwordHash: string;
  status: "ACTIVE" | "SUSPENDED";
  emailVerifiedAt: Date | null;
}

function publicCustomerAccount(account: {
  id: string;
  email: string;
  customer: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    document: string | null;
    address: string | null;
  };
}) {
  return {
    id: account.id,
    email: account.email,
    customer: {
      id: account.customer.id,
      name: account.customer.name,
      email: account.customer.email,
      phone: account.customer.phone,
      document: account.customer.document,
      address: account.customer.address,
    },
  };
}

async function loadPublicCustomerAccount(customerAccountId: string) {
  return prisma.customerAccount.findUniqueOrThrow({
    where: { id: customerAccountId },
    select: {
      id: true,
      email: true,
      customer: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          document: true,
          address: true,
        },
      },
    },
  });
}

export async function loginCustomerAccount(
  data: CustomerLoginInput,
): Promise<CustomerSessionResult | null> {
  const account = await prisma.customerAccount.findUnique({
    where: { email: normalizeEmail(data.email) },
    include: { customer: true },
  });
  const passwordValid = await verifyPassword(
    account?.passwordHash ?? DUMMY_PASSWORD_HASH,
    data.password,
  );

  if (
    !account ||
    !passwordValid ||
    account.status !== "ACTIVE" ||
    !account.emailVerifiedAt
  ) {
    return null;
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + CUSTOMER_SESSION_TTL_SECONDS * 1000);
  const { token: refreshToken, tokenHash } =
    generateCustomerSessionRefreshToken();
  const session = await prisma.$transaction(async (tx) => {
    const [locked] = await tx.$queryRaw<LockedCustomerLogin[]>`
      SELECT "id", "passwordHash", "status", "emailVerifiedAt"
      FROM "CustomerAccount"
      WHERE "id" = ${account.id}
      FOR UPDATE
    `;
    if (
      !locked ||
      locked.passwordHash !== account.passwordHash ||
      locked.status !== "ACTIVE" ||
      !locked.emailVerifiedAt
    ) {
      return null;
    }

    return tx.customerSession.create({
      data: {
        customerAccountId: account.id,
        expiresAt,
        lastUsedAt: now,
        refreshTokens: {
          create: { tokenHash, expiresAt },
        },
      },
    });
  });
  if (!session) return null;

  return {
    accessToken: signCustomerAccessToken({
      sub: account.id,
      sid: session.id,
      principalType: "CUSTOMER_ACCOUNT",
    }),
    refreshToken,
    customerAccount: publicCustomerAccount(account),
  };
}

export async function refreshCustomerSession(
  presentedToken: string,
): Promise<CustomerSessionResult | null> {
  const tokenHash = hashCustomerSessionRefreshToken(presentedToken);
  const nextRefresh = generateCustomerSessionRefreshToken();

  const rotated = await prisma.$transaction(async (tx) => {
    const [candidate] = await tx.$queryRaw<CustomerRefreshCandidate[]>`
      SELECT session."customerAccountId"
      FROM "CustomerSessionRefreshToken" AS refresh_token
      INNER JOIN "CustomerSession" AS session
        ON session."id" = refresh_token."customerSessionId"
      WHERE refresh_token."tokenHash" = ${tokenHash}
    `;
    if (!candidate) return null;

    // Password reset and refresh take the account lock first. A stable lock
    // order prevents reset × refresh deadlocks and makes revocation serialize.
    await tx.$queryRaw`
      SELECT "id"
      FROM "CustomerAccount"
      WHERE "id" = ${candidate.customerAccountId}
      FOR UPDATE
    `;

    const [stored] = await tx.$queryRaw<LockedCustomerRefreshToken[]>`
      SELECT
        refresh_token."id",
        refresh_token."customerSessionId",
        session."customerAccountId",
        account."email",
        account."status",
        account."emailVerifiedAt",
        refresh_token."expiresAt" AS "tokenExpiresAt",
        refresh_token."consumedAt",
        session."expiresAt" AS "sessionExpiresAt",
        session."revokedAt"
      FROM "CustomerSessionRefreshToken" AS refresh_token
      INNER JOIN "CustomerSession" AS session
        ON session."id" = refresh_token."customerSessionId"
      INNER JOIN "CustomerAccount" AS account
        ON account."id" = session."customerAccountId"
      WHERE refresh_token."tokenHash" = ${tokenHash}
      FOR UPDATE OF refresh_token, session
    `;

    if (!stored) return null;

    const now = new Date();
    const invalid =
      stored.consumedAt !== null ||
      stored.revokedAt !== null ||
      stored.tokenExpiresAt <= now ||
      stored.sessionExpiresAt <= now ||
      stored.status !== "ACTIVE" ||
      !stored.emailVerifiedAt;

    if (invalid) {
      await tx.customerSession.updateMany({
        where: { id: stored.customerSessionId, revokedAt: null },
        data: { revokedAt: now },
      });
      return null;
    }

    await tx.customerSessionRefreshToken.update({
      where: { id: stored.id },
      data: { consumedAt: now },
    });
    await tx.customerSessionRefreshToken.create({
      data: {
        customerSessionId: stored.customerSessionId,
        tokenHash: nextRefresh.tokenHash,
        expiresAt: stored.sessionExpiresAt,
      },
    });
    await tx.customerSession.update({
      where: { id: stored.customerSessionId },
      data: { lastUsedAt: now },
    });

    return {
      customerAccountId: stored.customerAccountId,
      customerSessionId: stored.customerSessionId,
    };
  });

  if (!rotated) return null;

  const account = await loadPublicCustomerAccount(rotated.customerAccountId);
  return {
    accessToken: signCustomerAccessToken({
      sub: rotated.customerAccountId,
      sid: rotated.customerSessionId,
      principalType: "CUSTOMER_ACCOUNT",
    }),
    refreshToken: nextRefresh.token,
    customerAccount: publicCustomerAccount(account),
  };
}

export async function revokeCustomerSession(credentials: {
  accessToken?: string;
  refreshToken?: string;
}) {
  const sessions: Array<{ id: string; customerAccountId?: string }> = [];

  if (credentials.refreshToken) {
    const tokenHash = hashCustomerSessionRefreshToken(credentials.refreshToken);
    const token = await prisma.customerSessionRefreshToken.findUnique({
      where: { tokenHash },
      select: { customerSessionId: true },
    });
    if (token) sessions.push({ id: token.customerSessionId });
  }

  if (credentials.accessToken) {
    try {
      const payload = verifyCustomerAccessToken(credentials.accessToken);
      sessions.push({ id: payload.sid, customerAccountId: payload.sub });
    } catch {
      // Logout remains idempotent: an invalid/expired access token must not
      // prevent cookie cleanup or reveal token validation details.
    }
  }

  if (sessions.length === 0) return;

  await prisma.customerSession.updateMany({
    where: {
      revokedAt: null,
      OR: sessions.map(({ id, customerAccountId }) => ({
        id,
        ...(customerAccountId ? { customerAccountId } : {}),
      })),
    },
    data: { revokedAt: new Date() },
  });
}

export async function getCustomerAccountProfile(customerAccountId: string) {
  return loadPublicCustomerAccount(customerAccountId);
}

export async function listCustomerServiceOrders(customerAccountId: string) {
  return prisma.serviceOrder.findMany({
    where: { customer: { customerAccount: { id: customerAccountId } } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      priority: true,
      technician: { select: { name: true } },
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function getCustomerServiceOrder(
  customerAccountId: string,
  serviceOrderId: string,
) {
  return prisma.serviceOrder.findFirst({
    where: {
      id: serviceOrderId,
      customer: { customerAccount: { id: customerAccountId } },
    },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      priority: true,
      technician: { select: { name: true } },
      createdAt: true,
      updatedAt: true,
    },
  });
}
