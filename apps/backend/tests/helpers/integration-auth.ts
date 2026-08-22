import request from "supertest";
import type { Express } from "express";

function extractCookieValue(cookies: string[], name: string): string | undefined {
  const line = cookies.find((c) => c.startsWith(`${name}=`));
  if (!line) return undefined;
  return line.split(";")[0].split("=").slice(1).join("=");
}

export interface IntegrationSession {
  cookie: string;
  csrfHeader: string;
}

/**
 * Logs in through the real POST /auth/login endpoint (not a hand-crafted
 * token) so integration tests exercise the actual auth flow end to end,
 * including password verification and cookie issuance. Returns a Cookie
 * header string (access_token + csrf_token) and the matching CSRF header
 * value, ready to attach to subsequent requests.
 */
export async function loginAs(
  app: Express,
  email: string,
  password: string,
): Promise<IntegrationSession> {
  const res = await request(app).post("/auth/login").send({ email, password });

  if (res.status !== 200) {
    throw new Error(
      `loginAs(${email}) failed with status ${res.status}: ${JSON.stringify(res.body)}`,
    );
  }

  const cookies = res.headers["set-cookie"] as unknown as string[];
  const accessToken = extractCookieValue(cookies, "access_token");
  const csrfToken = extractCookieValue(cookies, "csrf_token");

  if (!accessToken || !csrfToken) {
    throw new Error("loginAs: expected access_token and csrf_token cookies in login response");
  }

  return {
    cookie: `access_token=${accessToken}; csrf_token=${csrfToken}`,
    csrfHeader: csrfToken,
  };
}
