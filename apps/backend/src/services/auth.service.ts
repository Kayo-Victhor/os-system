import { prisma } from "../lib/prisma.js";
import { verifyPassword, hashPassword } from "../lib/password.js";
import type { LoginInput } from "../schemas/auth.schema.js";
import type { UserRole } from "../generated/prisma/client.js";
import {
  signAccessToken,
  generateRefreshToken,
  hashToken,
  REFRESH_TOKEN_TTL_SECONDS,
  PASSWORD_RESET_TOKEN_TTL_SECONDS,
  generatePasswordResetToken,
  hashPasswordResetToken,
} from "../lib/tokens.js";
import { sendPasswordResetEmail } from "./email.service.js";

export interface SessionResult {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    isPrimaryAdmin: boolean;
  };
}

export type LoginResult = SessionResult | null;

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

function sessionUser(user: { id: string; name: string; email: string; role: UserRole; isPrimaryAdmin: boolean }) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    isPrimaryAdmin: user.isPrimaryAdmin,
  };
}

export async function loginUser(data: LoginInput): Promise<LoginResult> {
  const user = await prisma.user.findUnique({ where: { email: data.email } });

  // Always compare a hash, including for an unknown address, so timing does
  // not reveal whether an account exists.
  const passwordHash =
    user?.password ??
    "$argon2id$v=19$m=19456,t=2,p=1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
  const passwordValid = await verifyPassword(passwordHash, data.password);

  if (!user || !passwordValid) return null;
  const { accessToken, refreshToken } = await issueSession(user.id);
  return { accessToken, refreshToken, user: sessionUser(user) };
}

/**
 * Rotates a refresh token. Reuse of a revoked or expired token revokes every
 * active refresh token for that user, treating it as a theft signal.
 */
export async function refreshSession(presentedToken: string): Promise<SessionResult | null> {
  const tokenHash = hashToken(presentedToken);
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });

  if (!stored) return null;

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
  return { accessToken, refreshToken, user: sessionUser(stored.user) };
}

export async function revokeRefreshToken(presentedToken: string) {
  const tokenHash = hashToken(presentedToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

async function replacePasswordResetToken(userId: string) {
  const { token, tokenHash } = generatePasswordResetToken();
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_SECONDS * 1000);
  await prisma.passwordResetToken.upsert({
    where: { userId },
    update: { tokenHash, expiresAt, usedAt: null },
    create: { tokenHash, userId, expiresAt },
  });
  return token;
}

/** Returns false for absent accounts. The controller always gives
 * the same accepted response, so this result can never enumerate users. */
export async function requestPasswordReset(email: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true },
  });
  if (!user) return false;
  const token = await replacePasswordResetToken(user.id);
  await sendPasswordResetEmail({ to: user.email, token });
  return true;
}

/** Atomically consumes the link, replaces the Argon2id hash, and invalidates
 * every existing refresh session so a compromised session cannot survive. */
export async function resetPassword(token: string, password: string): Promise<boolean> {
  const tokenHash = hashPasswordResetToken(token);
  const now = new Date();
  const stored = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!stored || stored.usedAt || stored.expiresAt <= now) return false;
  const passwordHash = await hashPassword(password);
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.passwordResetToken.updateMany({
      where: { id: stored.id, tokenHash, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claimed.count !== 1) return false;
    await tx.user.update({ where: { id: stored.userId }, data: { password: passwordHash } });
    await tx.refreshToken.updateMany({ where: { userId: stored.userId, revokedAt: null }, data: { revokedAt: now } });
    return true;
  });
}
