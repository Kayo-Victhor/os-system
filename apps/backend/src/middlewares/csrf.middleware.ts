import type { NextFunction, Request, Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { CSRF_COOKIE } from "../lib/cookies.js";

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
