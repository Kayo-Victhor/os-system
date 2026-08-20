import { apiRequest } from "./client.ts";
import type { AuthUser } from "./types.ts";

export function login(email: string, password: string) {
  return apiRequest<{ user: AuthUser }>("/auth/login", {
    method: "POST",
    body: { email, password },
  });
}

export function logout() {
  return apiRequest<void>("/auth/logout", { method: "POST" });
}

export function fetchCurrentUser() {
  return apiRequest<{ user: AuthUser }>("/auth/me");
}
