import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";

import app from "../../src/app.js";
import { resetDatabase, testPrisma } from "../helpers/test-db.js";
import { createFixtureUser, FIXTURE_PASSWORD } from "../helpers/fixtures.js";
import { loginAs } from "../helpers/integration-auth.js";

beforeEach(async () => {
  await resetDatabase();
});

describe("POST /auth/login — real database", () => {
  it.each(["ADMIN", "ATTENDANT", "TECHNICIAN"] as const)(
    "allows an unverified internal %s to log in immediately",
    async (role) => {
      const { user } = await createFixtureUser(role);

      const res = await request(app)
        .post("/auth/login")
        .send({ email: user.email, password: FIXTURE_PASSWORD });

      expect(res.status).toBe(200);
      expect(res.body.user.role).toBe(role);
    },
  );

  it("logs in with valid credentials and issues real session cookies", async () => {
    const { user } = await createFixtureUser("ADMIN", { email: "admin@example.com" });

    const res = await request(app)
      .post("/auth/login")
      .send({ email: user.email, password: FIXTURE_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(user.email);
    expect(res.body.user.role).toBe("ADMIN");
    expect(res.body.user.password).toBeUndefined();

    const cookies = res.headers["set-cookie"] as unknown as string[];
    expect(cookies.some((c) => c.startsWith("access_token="))).toBe(true);
    expect(cookies.some((c) => c.startsWith("refresh_token="))).toBe(true);

    // API_BASE_PATH is unset in the test environment (same as local dev,
    // since there's no Vercel rewrite in front of tests either) — the
    // refresh cookie's actual Path attribute should reflect that, not a
    // hardcoded production value.
    const refreshCookie = cookies.find((c) => c.startsWith("refresh_token="))!;
    expect(refreshCookie).toContain("Path=/auth/refresh");
    expect(refreshCookie).not.toContain("Path=/api/auth/refresh");

    // The refresh token really was persisted (hashed) in the database.
    const storedTokens = await testPrisma.refreshToken.findMany({
      where: { userId: user.id },
    });
    expect(storedTokens).toHaveLength(1);
    expect(storedTokens[0].revokedAt).toBeNull();
  });

  it("rejects an incorrect password", async () => {
    const { user } = await createFixtureUser("ADMIN");

    const res = await request(app)
      .post("/auth/login")
      .send({ email: user.email, password: "wrong-password-entirely" });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Credenciais inválidas");
  });

  it("rejects a nonexistent user with the same generic message (no enumeration)", async () => {
    const res = await request(app)
      .post("/auth/login")
      .send({ email: "nobody-here@example.com", password: "whatever123" });

    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Credenciais inválidas");
  });

  it("never stores the password in plain text", async () => {
    const { user } = await createFixtureUser("ADMIN");

    const stored = await testPrisma.user.findUniqueOrThrow({ where: { id: user.id } });

    expect(stored.password).not.toBe(FIXTURE_PASSWORD);
    expect(stored.password.startsWith("$argon2id$")).toBe(true);
  });
});

describe("Protected route access", () => {
  it("rejects access with no token at all", async () => {
    const res = await request(app).get("/auth/me");
    expect(res.status).toBe(401);
  });

  it("rejects access with an invalid/garbage token", async () => {
    const res = await request(app).get("/auth/me").set("Cookie", "access_token=not-a-real-jwt");
    expect(res.status).toBe(401);
  });

  it("rejects access with a well-formed but wrongly-signed token", async () => {
    // A syntactically valid JWT (header.payload.signature) signed with a
    // different secret than the server uses — must still be rejected.
    const forged =
      "eyJhbGciOiJIUzI1NiJ9." +
      Buffer.from(JSON.stringify({ sub: "x", role: "ADMIN" })).toString("base64url") +
      ".invalidsignature";

    const res = await request(app).get("/auth/me").set("Cookie", `access_token=${forged}`);
    expect(res.status).toBe(401);
  });

  it("grants access to a valid session and returns the real user record", async () => {
    const { user } = await createFixtureUser("TECHNICIAN");
    const session = await loginAs(app, user.email, FIXTURE_PASSWORD);

    const res = await request(app).get("/auth/me").set("Cookie", session.cookie);

    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(user.id);
    expect(res.body.user.role).toBe("TECHNICIAN");
  });
});

describe("Role verification is enforced by the backend, not client-supplied", () => {
  it.each(["ADMIN", "ATTENDANT", "TECHNICIAN"] as const)(
    "the session role for a %s account always matches the database, never the client",
    async (role) => {
      const { user } = await createFixtureUser(role);
      const session = await loginAs(app, user.email, FIXTURE_PASSWORD);

      const res = await request(app).get("/auth/me").set("Cookie", session.cookie);

      expect(res.status).toBe(200);
      expect(res.body.user.role).toBe(role);
    },
  );
});

describe("POST /auth/refresh — real rotation", () => {
  it("issues a new session and rotates the refresh token", async () => {
    const { user } = await createFixtureUser("ADMIN");

    const loginRes = await request(app)
      .post("/auth/login")
      .send({ email: user.email, password: FIXTURE_PASSWORD });

    const loginCookies = loginRes.headers["set-cookie"] as unknown as string[];
    const oldRefreshCookie = loginCookies.find((c) => c.startsWith("refresh_token="))!;
    const oldRefreshToken = oldRefreshCookie.split(";")[0].split("=")[1];

    const refreshRes = await request(app)
      .post("/auth/refresh")
      .set("Cookie", `refresh_token=${oldRefreshToken}; csrf_token=test-csrf`)
      .set("x-csrf-token", "test-csrf");

    expect(refreshRes.status).toBe(200);

    const newCookies = refreshRes.headers["set-cookie"] as unknown as string[];
    const newRefreshCookie = newCookies.find((c) => c.startsWith("refresh_token="))!;
    const newRefreshToken = newRefreshCookie.split(";")[0].split("=")[1];

    expect(newRefreshToken).not.toBe(oldRefreshToken);

    // The old token is now revoked and cannot be reused.
    const reuseRes = await request(app)
      .post("/auth/refresh")
      .set("Cookie", `refresh_token=${oldRefreshToken}; csrf_token=test-csrf`)
      .set("x-csrf-token", "test-csrf");

    expect(reuseRes.status).toBe(401);
  });

  it("reusing an already-rotated token revokes the whole session family", async () => {
    const { user } = await createFixtureUser("ADMIN");

    const loginRes = await request(app)
      .post("/auth/login")
      .send({ email: user.email, password: FIXTURE_PASSWORD });

    const loginCookies = loginRes.headers["set-cookie"] as unknown as string[];
    const firstRefreshToken = loginCookies
      .find((c) => c.startsWith("refresh_token="))!
      .split(";")[0]
      .split("=")[1];

    // Rotate once (valid use).
    const refreshRes = await request(app)
      .post("/auth/refresh")
      .set("Cookie", `refresh_token=${firstRefreshToken}; csrf_token=test-csrf`)
      .set("x-csrf-token", "test-csrf");
    const secondRefreshToken = (refreshRes.headers["set-cookie"] as unknown as string[])
      .find((c) => c.startsWith("refresh_token="))!
      .split(";")[0]
      .split("=")[1];

    // Reuse the original (now-rotated-out) token — theft signal.
    await request(app).post("/auth/refresh").set("Cookie", `refresh_token=${firstRefreshToken}; csrf_token=test-csrf`)
      .set("x-csrf-token", "test-csrf");

    // The second token (legitimately issued) must now ALSO be revoked,
    // since reuse of a rotated-out token revokes the whole family.
    const finalAttempt = await request(app)
      .post("/auth/refresh")
      .set("Cookie", `refresh_token=${secondRefreshToken}; csrf_token=test-csrf`)
      .set("x-csrf-token", "test-csrf");

    expect(finalAttempt.status).toBe(401);
  });

  it("serializes two simultaneous refreshes of the same token", async () => {
    const { user } = await createFixtureUser("ADMIN");
    const loginRes = await request(app)
      .post("/auth/login")
      .send({ email: user.email, password: FIXTURE_PASSWORD });
    const refreshToken = (loginRes.headers["set-cookie"] as unknown as string[])
      .find((cookie) => cookie.startsWith("refresh_token="))!
      .split(";")[0]
      .split("=")[1];
    const refresh = () => request(app)
      .post("/auth/refresh")
      .set("Cookie", `refresh_token=${refreshToken}; csrf_token=test-csrf`)
      .set("x-csrf-token", "test-csrf");

    const responses = await Promise.all([refresh(), refresh()]);

    expect(responses.map(({ status }) => status).sort()).toEqual([200, 401]);
    expect(await testPrisma.refreshToken.count({
      where: { userId: user.id, revokedAt: null },
    })).toBe(0);
  });

  it("rejects a refresh with no token", async () => {
    const res = await request(app).post("/auth/refresh");
    expect(res.status).toBe(401);
  });

  it("rejects a refresh with a session cookie but no CSRF token", async () => {
    const res = await request(app)
      .post("/auth/refresh")
      .set("Cookie", "refresh_token=totally-made-up-token-value");

    expect(res.status).toBe(403);
  });
});

describe("CSRF em operações de sessão", () => {
  it("blocks refresh of a valid session without a matching CSRF header", async () => {
    const { user } = await createFixtureUser("ADMIN");
    const login = await request(app).post("/auth/login").send({ email: user.email, password: FIXTURE_PASSWORD });
    const refresh = (login.headers["set-cookie"] as unknown as string[]).find((cookie) => cookie.startsWith("refresh_token="))!.split(";")[0];
    const csrf = (login.headers["set-cookie"] as unknown as string[]).find((cookie) => cookie.startsWith("csrf_token="))!.split(";")[0];

    const missingHeader = await request(app).post("/auth/refresh").set("Cookie", `${refresh}; ${csrf}`);
    expect(missingHeader.status).toBe(403);

    const logout = await request(app)
      .post("/auth/logout")
      .set("Cookie", `${refresh}; ${csrf}`)
      .set("x-csrf-token", csrf.split("=")[1]);
    expect(logout.status).toBe(204);
  });
});

describe("POST /auth/logout — real revocation", () => {
  it("revokes the refresh token so it can no longer be used", async () => {
    const { user } = await createFixtureUser("ADMIN");

    const loginRes = await request(app)
      .post("/auth/login")
      .send({ email: user.email, password: FIXTURE_PASSWORD });

    const refreshToken = (loginRes.headers["set-cookie"] as unknown as string[])
      .find((c) => c.startsWith("refresh_token="))!
      .split(";")[0]
      .split("=")[1];

    const logoutRes = await request(app)
      .post("/auth/logout")
      .set("Cookie", `refresh_token=${refreshToken}; csrf_token=test-csrf`)
      .set("x-csrf-token", "test-csrf");

    expect(logoutRes.status).toBe(204);

    const afterLogout = await request(app)
      .post("/auth/refresh")
      .set("Cookie", `refresh_token=${refreshToken}; csrf_token=test-csrf`)
      .set("x-csrf-token", "test-csrf");

    expect(afterLogout.status).toBe(401);
  });

  it("does not leave a usable token when logout races with refresh", async () => {
    const { user } = await createFixtureUser("ADMIN");
    const loginRes = await request(app)
      .post("/auth/login")
      .send({ email: user.email, password: FIXTURE_PASSWORD });
    const refreshToken = (loginRes.headers["set-cookie"] as unknown as string[])
      .find((cookie) => cookie.startsWith("refresh_token="))!
      .split(";")[0]
      .split("=")[1];
    const cookie = `refresh_token=${refreshToken}; csrf_token=test-csrf`;

    const [logout, refresh] = await Promise.all([
      request(app).post("/auth/logout").set("Cookie", cookie)
        .set("x-csrf-token", "test-csrf"),
      request(app).post("/auth/refresh").set("Cookie", cookie)
        .set("x-csrf-token", "test-csrf"),
    ]);

    expect(logout.status).toBe(204);
    expect([200, 401]).toContain(refresh.status);
    expect(await testPrisma.refreshToken.count({
      where: { userId: user.id, revokedAt: null },
    })).toBe(0);
  });
});
