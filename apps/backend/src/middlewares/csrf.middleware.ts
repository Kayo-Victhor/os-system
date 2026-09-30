import type { NextFunction, Request, Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { ACCESS_TOKEN_COOKIE, CSRF_COOKIE, REFRESH_TOKEN_COOKIE } from "../lib/cookies.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);
const CSRF_HEADER = "x-csrf-token";

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);

  if (bufA.length !== bufB.length) {
    return false;
  }

  return timingSafeEqual(bufA, bufB);
}

/**
 * Double-submit cookie CSRF check: the SPA reads the (non-httpOnly) csrf
 * cookie and echoes it back in a custom header. A cross-site form/script
 * can trigger the cookie to be sent automatically, but it cannot read the
 * cookie value to also set the header — same-origin policy blocks that.
 *
 * This only applies to cookie-authenticated requests. It is intentionally
 * separate from SameSite=Lax, which alone doesn't stop every CSRF vector
 * (e.g. simple cross-site GETs that trigger side effects, or older
 * browsers that don't enforce SameSite).
 */
export function csrfProtection(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE] as string | undefined;
  const headerToken = req.header(CSRF_HEADER);

  if (!cookieToken || !headerToken || !safeCompare(cookieToken, headerToken)) {
    res.status(403).json({
      error: "Falha na validação CSRF",
    });

    return;
  }

  next();
}

/** Applies double-submit CSRF only when a session cookie is present. This
 * preserves 401 responses for callers without a session while preventing
 * cross-site refresh/logout requests from acting on an existing session. */
export function csrfProtectionForSession(req: Request, res: Response, next: NextFunction) {
  const hasSession = Boolean(req.cookies?.[ACCESS_TOKEN_COOKIE] || req.cookies?.[REFRESH_TOKEN_COOKIE]);
  const hasCsrfCookie = Boolean(req.cookies?.[CSRF_COOKIE]);
  // An unknown refresh cookie alone is not a session and must reach the
  // controller so it receives the normal 401 response. Real browser sessions
  // always receive the CSRF cookie alongside login/refresh cookies.
  if (!hasSession || !hasCsrfCookie) { next(); return; }
  csrfProtection(req, res, next);
}
