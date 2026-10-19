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
    "CUSTOMER_ACCOUNT_MANAGE",
    "CUSTOMER_ANONYMIZE",

    "OS_CREATE",
    "OS_READ",
    "OS_UPDATE",
    "OS_DELETE",
    "OS_ASSIGN",
    "OS_UPDATE_STATUS",
    "OS_NOTE_READ",
    "OS_NOTE_CREATE",
    "REPORT_READ",

    "SETTINGS_READ",
    "SETTINGS_UPDATE"
  ],

  ATTENDANT: [
    "CUSTOMER_CREATE",
    "CUSTOMER_READ",
    "CUSTOMER_UPDATE",

    "OS_CREATE",
    "OS_READ",
    "OS_UPDATE",
    "OS_ASSIGN",
    "OS_NOTE_READ",
    "OS_NOTE_CREATE",
    "REPORT_READ"
  ],

  TECHNICIAN: [
    "CUSTOMER_CREATE",
    "CUSTOMER_READ",
    "OS_READ",
    "OS_UPDATE_STATUS",
    "OS_NOTE_READ",
    "OS_NOTE_CREATE"
  ],
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
  | "CUSTOMER_ACCOUNT_MANAGE"
  | "CUSTOMER_ANONYMIZE"
  | "OS_CREATE"
  | "OS_READ"
  | "OS_UPDATE"
  | "OS_DELETE"
  | "OS_ASSIGN"
  | "OS_UPDATE_STATUS"
  | "OS_NOTE_READ"
  | "OS_NOTE_CREATE"
  | "REPORT_READ"
  | "SETTINGS_READ"
  | "SETTINGS_UPDATE";
