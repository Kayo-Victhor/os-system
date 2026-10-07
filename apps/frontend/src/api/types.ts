export type UserRole = "ADMIN" | "ATTENDANT" | "TECHNICIAN";
export type InternalUserRole = UserRole;
export type CustomerAccountStatus = "ACTIVE" | "SUSPENDED";

export type ServiceOrderStatus =
  | "OPEN"
  | "IN_PROGRESS"
  | "WAITING"
  | "COMPLETED"
  | "CANCELLED";

export type ServiceOrderPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isPrimaryAdmin: boolean;
}

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  isPrimaryAdmin: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  document: string | null;
  address: string | null;
  createdAt: string;
  updatedAt: string;
  customerAccount?: { status: CustomerAccountStatus } | null;
}

export interface CustomerAccountProfile {
  id: string;
  email: string;
  customer: Pick<
    Customer,
    "id" | "name" | "email" | "phone" | "document" | "address"
  >;
}

export interface ServiceOrder {
  id: string;
  title: string;
  description: string;
  status: ServiceOrderStatus;
  priority: ServiceOrderPriority;
  customerId: string;
  technicianId: string | null;
  createdById: string;
  customer: Pick<Customer, "id" | "name" | "email" | "phone" | "address">;
  technician: ServiceOrderTechnician | null;
  createdBy: Pick<UserRecord, "id" | "name">;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceOrderTechnician {
  id: string;
  name: string;
}

export interface CustomerServiceOrder {
  id: string;
  title: string;
  description: string;
  status: ServiceOrderStatus;
  priority: ServiceOrderPriority;
  technician: { name: string } | null;
  createdAt: string;
  updatedAt: string;
}

export const SERVICE_ORDER_STATUSES: ServiceOrderStatus[] = [
  "OPEN",
  "IN_PROGRESS",
  "WAITING",
  "COMPLETED",
  "CANCELLED",
];

export const SERVICE_ORDER_STATUS_TRANSITIONS: Record<
  ServiceOrderStatus,
  readonly ServiceOrderStatus[]
> = {
  OPEN: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["WAITING", "COMPLETED", "CANCELLED"],
  WAITING: ["IN_PROGRESS", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function allowedStatusTransitions(
  currentStatus: ServiceOrderStatus,
  role: UserRole,
): readonly ServiceOrderStatus[] {
  const transitions = SERVICE_ORDER_STATUS_TRANSITIONS[currentStatus];
  return role === "TECHNICIAN"
    ? transitions.filter((status) => status !== "CANCELLED")
    : role === "ADMIN"
      ? transitions
      : [];
}

export const SERVICE_ORDER_PRIORITIES: ServiceOrderPriority[] = [
  "LOW",
  "MEDIUM",
  "HIGH",
  "URGENT",
];

export const STATUS_LABELS: Record<ServiceOrderStatus, string> = {
  OPEN: "Aberta",
  IN_PROGRESS: "Em andamento",
  WAITING: "Aguardando",
  COMPLETED: "Concluída",
  CANCELLED: "Cancelada",
};

export const PRIORITY_LABELS: Record<ServiceOrderPriority, string> = {
  LOW: "Baixa",
  MEDIUM: "Média",
  HIGH: "Alta",
  URGENT: "Urgente",
};

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: "Administrador",
  ATTENDANT: "Atendente",
  TECHNICIAN: "Técnico",
};
