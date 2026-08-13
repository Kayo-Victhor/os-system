import { signAccessToken } from "../../src/lib/tokens.js";
import type { UserRole } from "../../src/generated/prisma/client.js";

/**
 * Builds a Cookie header + matching CSRF header for an authenticated
 * request, without going through the real /auth/login flow. This lets
 * controller/authorization tests set up "logged in as ADMIN/TECHNICIAN/USER"
 * scenarios directly, while auth.test.ts covers the login flow itself.
 */
export function authAs(userId: string, role: UserRole) {
  const accessToken = signAccessToken({ sub: userId, role });
  const csrfToken = "test-csrf-token";

  return {
    cookie: `access_token=${accessToken}; csrf_token=${csrfToken}`,
    csrfHeader: csrfToken,
  };
}
