import type { CookieOptions } from "express";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
} from "./tokens.js";

export const ACCESS_TOKEN_COOKIE = "access_token";
export const REFRESH_TOKEN_COOKIE = "refresh_token";
export const CSRF_COOKIE = "csrf_token";

const isProduction = process.env.NODE_ENV === "production";

// The Express app's own route is always /auth/refresh (see
// routes/auth.routes.ts) — that never changes. What changes between
// environments is what URL the *browser* actually requests it at:
//
//   - Local dev: the frontend calls http://localhost:3333/auth/refresh
//     directly (no rewrite in front of it — vite.config.ts has no proxy).
//   - Production: the frontend calls /api/auth/refresh on the Vercel
//     origin, which Vercel's rewrite (apps/frontend/vercel.json) forwards
//     to this server's /auth/refresh.
//
// A cookie's Path is matched against the URL the browser requested, not
// the server's internal route — so the Path must reflect the frontend's
// URL, which differs by environment. API_BASE_PATH captures that one
// difference explicitly (set to "/api" in Render's environment variables
// for production; left unset locally), rather than tying it to
// NODE_ENV === "production" — "are we in production" and "are we behind
// an /api rewrite" are different questions that happen to currently
// coincide, and conflating them is exactly how this broke in dev the
// first time.
const apiBasePath = (process.env.API_BASE_PATH ?? "").replace(/\/+$/, "");

// Scope the refresh cookie to the one endpoint that needs it, so it's never
// sent on ordinary API calls (reduces exposure if any endpoint were ever
// vulnerable to token leakage via logs, proxies, etc). Exported so
// auth.controller.ts's clearCookie calls use this exact same value
// instead of a second hardcoded copy.
export const REFRESH_COOKIE_PATH = `${apiBasePath}/auth/refresh`;

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
