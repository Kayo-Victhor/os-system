import type {
  ServiceOrderPriority,
  ServiceOrderStatus,
} from "../generated/prisma/client.js";

export const RESOLUTION_SLA_MINUTES = Object.freeze({
  URGENT: 240,
  HIGH: 480,
  MEDIUM: 1_440,
  LOW: 4_320,
} satisfies Record<ServiceOrderPriority, number>);

/** Fixed first-version warning window based on elapsed calendar time. */
export const RESOLUTION_SLA_DUE_SOON_MINUTES = 60;

export type ResolutionSlaStatus =
  | "ON_TRACK"
  | "DUE_SOON"
  | "BREACHED"
  | "MET"
  | "CANCELLED"
  | "UNTRACKED";

const MINUTE_IN_MILLISECONDS = 60_000;

export function resolutionSlaForPriority(
  priority: ServiceOrderPriority,
  createdAt: Date,
) {
  const targetMinutes = RESOLUTION_SLA_MINUTES[priority];
  return {
    targetMinutes,
    dueAt: new Date(createdAt.getTime() + targetMinutes * MINUTE_IN_MILLISECONDS),
  };
}

export function classifyResolutionSla(
  input: {
    status: ServiceOrderStatus;
    targetMinutes: number | null | undefined;
    dueAt: Date | null | undefined;
    completedAt?: Date | null;
  },
  now = new Date(),
): ResolutionSlaStatus {
  if (!input.targetMinutes || !input.dueAt) return "UNTRACKED";

  if (input.status === "CANCELLED") return "CANCELLED";

  if (input.status === "COMPLETED") {
    if (!input.completedAt) return "UNTRACKED";
    return input.completedAt.getTime() <= input.dueAt.getTime() ? "MET" : "BREACHED";
  }

  if (now.getTime() > input.dueAt.getTime()) return "BREACHED";

  const dueSoonAt = input.dueAt.getTime()
    - RESOLUTION_SLA_DUE_SOON_MINUTES * MINUTE_IN_MILLISECONDS;
  return now.getTime() >= dueSoonAt ? "DUE_SOON" : "ON_TRACK";
}
