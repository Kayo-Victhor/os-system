import { prisma } from "../lib/prisma.js";
import { verifyPassword, hashPassword } from "../lib/password.js";
import type { LoginInput } from "../schemas/auth.schema.js";
import type { RegisterInput } from "../schemas/user.schema.js";
import type { UserRole } from "../generated/prisma/client.js";
import {
  signAccessToken,
  generateRefreshToken,
  hashToken,
  REFRESH_TOKEN_TTL_SECONDS,
} from "../lib/tokens.js";

export interface SessionResult {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
  };
}

async function issueSession(userId: string): Promise<{
  accessToken: string;
  refreshToken: string;
}> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

  const accessToken = signAccessToken({ sub: user.id, role: user.role });
  const { token: refreshToken, tokenHash } = generateRefreshToken();

  await prisma.refreshToken.create({
    data: {
      tokenHash,
      userId: user.id,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
    },
  });

  return { accessToken, refreshToken };
}

export async function loginUser(
  data: LoginInput,
): Promise<SessionResult | null> {
  const user = await prisma.user.findUnique({
    where: { email: data.email },
  });

  // Always run a hash comparison, even for a non-existent user, so response
  // timing doesn't reveal whether the email exists (basic enumeration
  // hardening — not a substitute for rate limiting, which also applies).
  const passwordHash =
    user?.password ??
    "$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

  const passwordValid = await verifyPassword(passwordHash, data.password);

  if (!user || !passwordValid) {
    return null;
  }

  const { accessToken, refreshToken } = await issueSession(user.id);

  return {
    accessToken,
    refreshToken,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  };
}

/**
 * Rotates a refresh token: the presented token is revoked and a new
 * access+refresh pair is issued. If the presented token was already
 * revoked or is expired, every other active token for that user is revoked
 * too — reuse of a rotated-out token is a strong signal of theft.
 */
export async function refreshSession(
  presentedToken: string,
): Promise<SessionResult | null> {
  const tokenHash = hashToken(presentedToken);

  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!stored) {
    return null;
  }

  const isExpired = stored.expiresAt.getTime() < Date.now();

  if (stored.revokedAt || isExpired) {
    await prisma.refreshToken.updateMany({
      where: { userId: stored.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    return null;
  }

  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { revokedAt: new Date() },
  });

  const { accessToken, refreshToken } = await issueSession(stored.userId);

  return {
    accessToken,
    refreshToken,
    user: {
      id: stored.user.id,
      name: stored.user.name,
      email: stored.user.email,
      role: stored.user.role,
    },
  };
}

export async function revokeRefreshToken(presentedToken: string) {
  const tokenHash = hashToken(presentedToken);

  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/**
 * Public self-registration. The created account's role is always
 * CUSTOMER — this is not a parameter and there is no code path by which
 * a caller can influence it (see schemas/user.schema.ts#registerSchema).
 * Does not create a session (no auto-login): the account is created and
 * the caller logs in separately via POST /auth/login, same as an account
 * created by an admin through POST /users.
 */
export async function registerCustomer(data: RegisterInput) {
  const passwordHash = await hashPassword(data.password);

  return prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      password: passwordHash,
      role: "CUSTOMER",
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}
