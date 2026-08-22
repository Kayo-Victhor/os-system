import type {
  ServiceOrderPriority,
  ServiceOrderStatus,
  UserRole,
} from "../api/types.ts";
import { PRIORITY_LABELS, ROLE_LABELS, STATUS_LABELS } from "../api/types.ts";

const STATUS_COLOR: Record<ServiceOrderStatus, string> = {
  OPEN: "badge-gray",
  IN_PROGRESS: "badge-blue",
  WAITING: "badge-amber",
  COMPLETED: "badge-green",
  CANCELLED: "badge-red",
};

const PRIORITY_COLOR: Record<ServiceOrderPriority, string> = {
  LOW: "badge-gray",
  MEDIUM: "badge-blue",
  HIGH: "badge-amber",
  URGENT: "badge-red",
};

const ROLE_COLOR: Record<UserRole, string> = {
  ADMIN: "badge-red",
  USER: "badge-blue",
  TECHNICIAN: "badge-green",
  CUSTOMER: "badge-gray",
};

export function StatusBadge({ status }: { status: ServiceOrderStatus }) {
  return (
    <span className={`badge ${STATUS_COLOR[status]}`}>
      <span className="badge-dot" aria-hidden="true" />
      {STATUS_LABELS[status]}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: ServiceOrderPriority }) {
  return <span className={`badge ${PRIORITY_COLOR[priority]}`}>{PRIORITY_LABELS[priority]}</span>;
}

export function RoleBadge({ role }: { role: UserRole }) {
  return <span className={`badge ${ROLE_COLOR[role]}`}>{ROLE_LABELS[role]}</span>;
}
