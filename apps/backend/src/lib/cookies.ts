import type { CookieOptions } from "express";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
} from "./tokens.js";

export const ACCESS_TOKEN_COOKIE = "access_token";
export const REFRESH_TOKEN_COOKIE = "refresh_token";
export const CSRF_COOKIE = "csrf_token";

const isProduction = process.env.NODE_ENV === "production";

// Scope the refresh cookie to the one endpoint that needs it, so it's never
// sent on ordinary API calls (reduces exposure if any endpoint were ever
// vulnerable to token leakage via logs, proxies, etc).
const REFRESH_COOKIE_PATH = "/auth/refresh";

const baseCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? "none" : "lax",
  path: "/",
};

export function accessTokenCookieOptions(): CookieOptions {
  return {
    ...baseCookieOptions,
    maxAge: ACCESS_TOKEN_TTL_SECONDS * 1000,
  };
}

export function refreshTokenCookieOptions(): CookieOptions {
  return {
    ...baseCookieOptions,
    path: REFRESH_COOKIE_PATH,
    maxAge: REFRESH_TOKEN_TTL_SECONDS * 1000,
  };
}

// The CSRF cookie must be readable by JavaScript (double-submit pattern),
// so it is deliberately NOT httpOnly. It carries no secret/session value on
// its own — it only proves the request originated from a page that could
// read same-site cookies.
export function csrfCookieOptions(): CookieOptions {
  return {
    httpOnly: false,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    path: "/",
    maxAge: REFRESH_TOKEN_TTL_SECONDS * 1000,
  };
}

export function clearCookieOptions(path = "/"): CookieOptions {
  return {
    ...baseCookieOptions,
    path,
  };
}
