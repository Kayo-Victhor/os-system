import type { UserRole } from "./types.ts";

// Mirrors apps/backend/src/config/permissions.ts. This is UI-convenience
// only (deciding what to render/enable) — every one of these actions is
// re-checked by the backend regardless of what the frontend shows, because
// the frontend is never the security boundary.
export const PERMISSIONS = {
  ADMIN: new Set([
    "USER_CREATE",
    "USER_READ",
    "USER_UPDATE",
    "USER_DELETE",
    "CUSTOMER_CREATE",
    "CUSTOMER_READ",
    "CUSTOMER_UPDATE",
    "CUSTOMER_DELETE",
    "OS_CREATE",
    "OS_READ",
    "OS_UPDATE",
    "OS_DELETE",
    "OS_ASSIGN",
    "OS_UPDATE_STATUS",
  ]),
  USER: new Set(["CUSTOMER_CREATE", "CUSTOMER_READ", "CUSTOMER_UPDATE", "OS_CREATE", "OS_READ"]),
  TECHNICIAN: new Set(["CUSTOMER_READ", "OS_READ", "OS_UPDATE_STATUS"]),
} as const satisfies Record<UserRole, Set<string>>;

export type Permission =
  | "USER_CREATE"
  | "USER_READ"
  | "USER_UPDATE"
  | "USER_DELETE"
  | "CUSTOMER_CREATE"
  | "CUSTOMER_READ"
  | "CUSTOMER_UPDATE"
  | "CUSTOMER_DELETE"
  | "OS_CREATE"
  | "OS_READ"
  | "OS_UPDATE"
  | "OS_DELETE"
  | "OS_ASSIGN"
  | "OS_UPDATE_STATUS";

export function roleHasPermission(role: UserRole, permission: Permission): boolean {
  return (PERMISSIONS[role] as Set<string>).has(permission);
}
