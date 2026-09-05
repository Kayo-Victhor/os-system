import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// cookies.ts reads process.env.API_BASE_PATH exactly once, at module load
// time, to build REFRESH_COOKIE_PATH — so each case here resets the module
// registry and re-imports fresh after setting the env var, rather than
// mutating process.env and expecting an already-loaded module to notice.

const ORIGINAL_API_BASE_PATH = process.env.API_BASE_PATH;

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  if (ORIGINAL_API_BASE_PATH === undefined) {
    delete process.env.API_BASE_PATH;
  } else {
    process.env.API_BASE_PATH = ORIGINAL_API_BASE_PATH;
  }
});

describe("REFRESH_COOKIE_PATH — environment-aware cookie Path", () => {
  it("defaults to /auth/refresh when API_BASE_PATH is unset (local dev)", async () => {
    delete process.env.API_BASE_PATH;

    const { REFRESH_COOKIE_PATH } = await import("../src/lib/cookies.js");

    expect(REFRESH_COOKIE_PATH).toBe("/auth/refresh");
  });

  it("defaults to /auth/refresh when API_BASE_PATH is an empty string", async () => {
    process.env.API_BASE_PATH = "";

    const { REFRESH_COOKIE_PATH } = await import("../src/lib/cookies.js");

    expect(REFRESH_COOKIE_PATH).toBe("/auth/refresh");
  });

  it("prefixes with API_BASE_PATH when set (production, behind the Vercel rewrite)", async () => {
    process.env.API_BASE_PATH = "/api";

    const { REFRESH_COOKIE_PATH } = await import("../src/lib/cookies.js");

    expect(REFRESH_COOKIE_PATH).toBe("/api/auth/refresh");
  });

  it("normalizes a trailing slash on API_BASE_PATH instead of producing a double slash", async () => {
    process.env.API_BASE_PATH = "/api/";

    const { REFRESH_COOKIE_PATH } = await import("../src/lib/cookies.js");

    expect(REFRESH_COOKIE_PATH).toBe("/api/auth/refresh");
  });

  it("refreshTokenCookieOptions() uses the same resolved path", async () => {
    process.env.API_BASE_PATH = "/api";

    const { REFRESH_COOKIE_PATH, refreshTokenCookieOptions } = await import(
      "../src/lib/cookies.js"
    );

    expect(refreshTokenCookieOptions().path).toBe(REFRESH_COOKIE_PATH);
  });

  it("does not affect the access token or CSRF cookies, which stay unscoped", async () => {
    process.env.API_BASE_PATH = "/api";

    const { accessTokenCookieOptions, csrfCookieOptions } = await import(
      "../src/lib/cookies.js"
    );

    expect(accessTokenCookieOptions().path).toBe("/");
    expect(csrfCookieOptions().path).toBe("/");
  });
});
