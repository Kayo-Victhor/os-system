import "dotenv/config";
import { randomBytes, createHmac } from "node:crypto";
import jwt from "jsonwebtoken";

import type { UserRole } from "../generated/prisma/client.js";

const JWT_ACCESS_SECRET: string = process.env.JWT_ACCESS_SECRET ?? "";
const JWT_REFRESH_SECRET: string = process.env.JWT_REFRESH_SECRET ?? "";

if (!JWT_ACCESS_SECRET || !JWT_REFRESH_SECRET) {
  throw new Error(
    "JWT_ACCESS_SECRET e JWT_REFRESH_SECRET precisam estar configurados",
  );
}

// Short-lived: limits the blast radius if an access token ever leaks.
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes
// Longer-lived, but rotated on every use and revocable server-side.
export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

export interface AccessTokenPayload {
  sub: string;
  role: UserRole;
}

export interface CustomerAccessTokenPayload {
  sub: string;
  sid: string;
  principalType: "CUSTOMER_ACCOUNT";
}

const INTERNAL_USER_ROLES = new Set<UserRole>([
  "ADMIN",
  "ATTENDANT",
  "TECHNICIAN",
]);

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, JWT_ACCESS_SECRET, {
    algorithm: "HS256",
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const decoded = jwt.verify(token, JWT_ACCESS_SECRET, {
    algorithms: ["HS256"],
  });

  if (
    typeof decoded === "string" ||
    !decoded.sub ||
    typeof decoded.role !== "string" ||
    !INTERNAL_USER_ROLES.has(decoded.role as UserRole) ||
    decoded.principalType
  ) {
    throw new Error("Token de acesso inválido");
  }

  return { sub: decoded.sub, role: decoded.role as UserRole };
}

export const CUSTOMER_ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const CUSTOMER_SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

export function signCustomerAccessToken(
  payload: CustomerAccessTokenPayload,
): string {
  return jwt.sign(payload, JWT_ACCESS_SECRET, {
    algorithm: "HS256",
    expiresIn: CUSTOMER_ACCESS_TOKEN_TTL_SECONDS,
  });
}

export function verifyCustomerAccessToken(
  token: string,
): CustomerAccessTokenPayload {
  const decoded = jwt.verify(token, JWT_ACCESS_SECRET, {
    algorithms: ["HS256"],
  });

  if (
    typeof decoded === "string" ||
    !decoded.sub ||
    !decoded.sid ||
    decoded.principalType !== "CUSTOMER_ACCOUNT" ||
    decoded.role
  ) {
    throw new Error("Token de acesso de cliente inválido");
  }

  return {
    sub: decoded.sub,
    sid: decoded.sid as string,
    principalType: "CUSTOMER_ACCOUNT",
  };
}

/**
 * Refresh tokens are opaque random strings, not JWTs: we only ever need to
 * look them up by hash in the database (where expiry/revocation live), so
 * there's no benefit to a self-describing signed token here — and an
 * opaque token can't be inspected or replayed for claims the way a JWT can.
 */
export function generateRefreshToken(): {
  token: string;
  tokenHash: string;
} {
  const token = randomBytes(48).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

export function generateCustomerSessionRefreshToken(): {
  token: string;
  tokenHash: string;
} {
  const token = randomBytes(48).toString("base64url");
  return { token, tokenHash: hashCustomerSessionRefreshToken(token) };
}

export function hashCustomerSessionRefreshToken(token: string): string {
  return createHmac("sha256", JWT_REFRESH_SECRET)
    .update(`customer-session-refresh:${token}`)
    .digest("hex");
}

export const PENDING_CUSTOMER_REGISTRATION_TTL_SECONDS = 24 * 60 * 60;
export const PENDING_CUSTOMER_REGISTRATION_TOKEN_TTL_SECONDS = 24 * 60 * 60;
// A short lifetime limits the usefulness of a stolen password-reset link.
export const PASSWORD_RESET_TOKEN_TTL_SECONDS = 60 * 60;
export const CUSTOMER_ACCOUNT_PASSWORD_RESET_TOKEN_TTL_SECONDS = 60 * 60;

export function generatePendingCustomerRegistrationToken(): {
  token: string;
  tokenHash: string;
} {
  const token = randomBytes(48).toString("base64url");
  return { token, tokenHash: hashPendingCustomerRegistrationToken(token) };
}

export function hashPendingCustomerRegistrationToken(token: string): string {
  const secret = process.env.EMAIL_VERIFICATION_SECRET;
  if (!secret) {
    throw new Error("EMAIL_VERIFICATION_SECRET precisa estar configurado");
  }

  return createHmac("sha256", secret)
    .update(`pending-customer-registration:${token}`)
    .digest("hex");
}

export function generatePasswordResetToken(): {
  token: string;
  tokenHash: string;
} {
  const token = randomBytes(48).toString("base64url");
  return { token, tokenHash: hashPasswordResetToken(token) };
}

export function hashPasswordResetToken(token: string): string {
  const secret = process.env.PASSWORD_RESET_SECRET;
  if (!secret) {
    throw new Error("PASSWORD_RESET_SECRET precisa estar configurado");
  }
  return createHmac("sha256", secret).update(token).digest("hex");
}

export function generateCustomerAccountPasswordResetToken(): {
  token: string;
  tokenHash: string;
} {
  const token = randomBytes(48).toString("base64url");
  return { token, tokenHash: hashCustomerAccountPasswordResetToken(token) };
}

export function hashCustomerAccountPasswordResetToken(token: string): string {
  const secret = process.env.PASSWORD_RESET_SECRET;
  if (!secret) {
    throw new Error("PASSWORD_RESET_SECRET precisa estar configurado");
  }

  return createHmac("sha256", secret)
    .update(`customer-account-password-reset:${token}`)
    .digest("hex");
}

// HMAC (keyed by JWT_REFRESH_SECRET) rather than a bare hash, so a database
// leak alone isn't enough to build a lookup/rainbow table against tokens —
// the app secret is also required.
export function hashToken(token: string): string {
  return createHmac("sha256", JWT_REFRESH_SECRET).update(token).digest("hex");
}

export function generateCsrfToken(): string {
  return randomBytes(32).toString("base64url");
}
