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
    "CUSTOMER_CREATE",
    "CUSTOMER_READ",
    "OS_READ",
    "OS_UPDATE_STATUS"
  ],

  // A self-registered CUSTOMER is bound to exactly one Customer record.
  // Controller-level ownership checks restrict these permissions to that
  // linked record and its service orders.
  CUSTOMER: [
    "CUSTOMER_READ",
    "CUSTOMER_UPDATE",
    "OS_READ",
  ]
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