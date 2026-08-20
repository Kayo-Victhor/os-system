export type UserRole = "ADMIN" | "USER" | "TECHNICIAN";

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
}

export interface UserRecord {
  id: string;
  name: string;
  email: string;
  role: UserRole;
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
  customer: Customer;
  technician: Pick<UserRecord, "id" | "name" | "email" | "role"> | null;
  createdBy: Pick<UserRecord, "id" | "name" | "email" | "role">;
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
  USER: "Atendente",
  TECHNICIAN: "Técnico",
};
