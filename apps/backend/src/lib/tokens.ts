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

  if (typeof decoded === "string" || !decoded.sub || !decoded.role) {
    throw new Error("Token de acesso inválido");
  }

  return { sub: decoded.sub, role: decoded.role as UserRole };
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

// HMAC (keyed by JWT_REFRESH_SECRET) rather than a bare hash, so a database
// leak alone isn't enough to build a lookup/rainbow table against tokens —
// the app secret is also required.
export function hashToken(token: string): string {
  return createHmac("sha256", JWT_REFRESH_SECRET).update(token).digest("hex");
}

export function generateCsrfToken(): string {
  return randomBytes(32).toString("base64url");
}
