import type { UserRole } from "../generated/prisma/client.js";

export const permissions = {
  ADMIN: [
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

    "SETTINGS_READ",
    "SETTINGS_UPDATE"
  ],

  USER: [
    "CUSTOMER_CREATE",
    "CUSTOMER_READ",
    "CUSTOMER_UPDATE",

    "OS_CREATE",
    "OS_READ"
  ],

  TECHNICIAN: [
    "CUSTOMER_READ",
    "OS_READ",
    "OS_UPDATE_STATUS"
  ],

  // Deliberately minimal: a CUSTOMER account (self-registered via
  // POST /auth/register) has no defined link yet to a business Customer
  // record (name/phone/document/service-order history) — that link (by
  // email match? an explicit customerId set at registration? something
  // else?) is a real product decision this project hasn't made. Rather
  // than guess, CUSTOMER gets no listed permissions beyond what every
  // authenticated user already has regardless of role (GET /auth/me,
  // POST /auth/logout, POST /auth/refresh — none of which go through
  // requirePermission). A customer-facing portal (view their own service
  // orders, etc.) is a follow-up, not implemented here.
  CUSTOMER: []
} as const satisfies Record<UserRole, readonly string[]>;

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
  | "OS_UPDATE_STATUS"
  | "SETTINGS_READ"
  | "SETTINGS_UPDATE";