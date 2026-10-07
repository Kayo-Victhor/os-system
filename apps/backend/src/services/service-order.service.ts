import { prisma } from "../lib/prisma.js";
import type {
  CreateServiceOrderInput,
  UpdateServiceOrderInput,
} from "../schemas/service-order.schema.js";

import type {
  ServiceOrderStatus,
  ServiceOrderPriority,
  UserRole,
  Prisma,
} from "../generated/prisma/client.js";

const serviceOrderSelect = {
  id: true,
  title: true,
  description: true,
  status: true,
  priority: true,
  customerId: true,
  technicianId: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  customer: {
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      address: true,
    },
  },
  technician: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.ServiceOrderSelect;

export const SERVICE_ORDER_STATUS_TRANSITIONS = {
  OPEN: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["WAITING", "COMPLETED", "CANCELLED"],
  WAITING: ["IN_PROGRESS", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
} as const satisfies Record<ServiceOrderStatus, readonly ServiceOrderStatus[]>;

const TECHNICIAN_STATUS_TRANSITIONS = {
  OPEN: ["IN_PROGRESS"],
  IN_PROGRESS: ["WAITING", "COMPLETED"],
  WAITING: ["IN_PROGRESS"],
  COMPLETED: [],
  CANCELLED: [],
} as const satisfies Record<ServiceOrderStatus, readonly ServiceOrderStatus[]>;

export interface ServiceOrderActor {
  userId: string;
  role: UserRole;
}

export type ServiceOrderDomainErrorCode =
  | "CUSTOMER_NOT_FOUND"
  | "SERVICE_ORDER_NOT_FOUND"
  | "TECHNICIAN_INVALID"
  | "STATUS_FORBIDDEN"
  | "INVALID_STATUS_TRANSITION"
  | "STATUS_CONFLICT"
  | "ASSIGNMENT_CONFLICT";

export class ServiceOrderDomainError extends Error {
  constructor(public readonly code: ServiceOrderDomainErrorCode) {
    super(code);
    this.name = "ServiceOrderDomainError";
  }
}

function technicianScope(actor?: ServiceOrderActor): Prisma.ServiceOrderWhereInput {
  return actor?.role === "TECHNICIAN" ? { technicianId: actor.userId } : {};
}

export function canTransitionServiceOrderStatus(
  role: UserRole,
  currentStatus: ServiceOrderStatus,
  nextStatus: ServiceOrderStatus,
) {
  const transitions = role === "TECHNICIAN"
    ? TECHNICIAN_STATUS_TRANSITIONS
    : role === "ADMIN"
      ? SERVICE_ORDER_STATUS_TRANSITIONS
      : null;

  if (!transitions) return false;
  return (transitions[currentStatus] as readonly ServiceOrderStatus[]).includes(nextStatus);
}

export async function createServiceOrder(
  data: CreateServiceOrderInput,
  createdById: string,
) {
  const customer = await prisma.customer.findUnique({
    where: { id: data.customerId },
    select: { id: true },
  });
  if (!customer) throw new ServiceOrderDomainError("CUSTOMER_NOT_FOUND");

  return prisma.serviceOrder.create({
    data: {
      title: data.title,
      description: data.description,
      priority: data.priority,
      customerId: customer.id,
      createdById,
      status: "OPEN",
    },
    select: serviceOrderSelect,
  });
}

export interface ListServiceOrdersFilters {
  status?: ServiceOrderStatus;
  priority?: ServiceOrderPriority;
  customerId?: string;
  technicianId?: string;
  search?: string;
}

export async function listServiceOrders(
  filters: ListServiceOrdersFilters = {},
  actor?: ServiceOrderActor,
) {
  const where: Prisma.ServiceOrderWhereInput = {
    status: filters.status,
    priority: filters.priority,
    customerId: filters.customerId,
    technicianId: actor?.role === "TECHNICIAN"
      ? actor.userId
      : filters.technicianId,
    ...(filters.search
      ? {
          OR: [
            { title: { contains: filters.search, mode: "insensitive" } },
            { description: { contains: filters.search, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  return prisma.serviceOrder.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: serviceOrderSelect,
  });
}

export async function getServiceOrderById(
  id: string,
  actor?: ServiceOrderActor,
) {
  return prisma.serviceOrder.findFirst({
    where: { id, ...technicianScope(actor) },
    select: serviceOrderSelect,
  });
}

export async function updateServiceOrder(
  id: string,
  data: UpdateServiceOrderInput,
) {
  return prisma.serviceOrder.update({
    where: { id },
    data,
    select: serviceOrderSelect,
  });
}

export async function deleteServiceOrder(id: string) {
  return prisma.serviceOrder.delete({ where: { id } });
}

export async function listAssignableTechnicians() {
  return prisma.user.findMany({
    where: { role: "TECHNICIAN" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

export async function assignTechnician(
  id: string,
  technicianId: string | null,
) {
  const order = await prisma.serviceOrder.findUnique({
    where: { id },
    select: { id: true, technicianId: true },
  });
  if (!order) throw new ServiceOrderDomainError("SERVICE_ORDER_NOT_FOUND");

  if (technicianId) {
    const technician = await prisma.user.findUnique({
      where: { id: technicianId },
      select: { id: true, role: true },
    });
    if (!technician || technician.role !== "TECHNICIAN") {
      throw new ServiceOrderDomainError("TECHNICIAN_INVALID");
    }
  }

  const updated = await prisma.serviceOrder.updateMany({
    where: { id, technicianId: order.technicianId },
    data: { technicianId },
  });
  if (updated.count !== 1) {
    throw new ServiceOrderDomainError("ASSIGNMENT_CONFLICT");
  }

  const result = await getServiceOrderById(id);
  if (!result) throw new ServiceOrderDomainError("SERVICE_ORDER_NOT_FOUND");
  return result;
}

export async function updateServiceOrderStatus(
  id: string,
  status: ServiceOrderStatus,
  actor: ServiceOrderActor,
) {
  const order = await prisma.serviceOrder.findFirst({
    where: { id, ...technicianScope(actor) },
    select: { id: true, status: true },
  });
  if (!order) throw new ServiceOrderDomainError("SERVICE_ORDER_NOT_FOUND");

  if (actor.role !== "ADMIN" && actor.role !== "TECHNICIAN") {
    throw new ServiceOrderDomainError("STATUS_FORBIDDEN");
  }

  if (!canTransitionServiceOrderStatus(actor.role, order.status, status)) {
    const isValidForAdmin = (
      SERVICE_ORDER_STATUS_TRANSITIONS[order.status] as readonly ServiceOrderStatus[]
    ).includes(status);
    throw new ServiceOrderDomainError(
      actor.role === "TECHNICIAN" && isValidForAdmin
        ? "STATUS_FORBIDDEN"
        : "INVALID_STATUS_TRANSITION",
    );
  }

  const updated = await prisma.serviceOrder.updateMany({
    where: {
      id,
      status: order.status,
      ...technicianScope(actor),
    },
    data: { status },
  });
  if (updated.count !== 1) {
    throw new ServiceOrderDomainError("STATUS_CONFLICT");
  }

  const result = await getServiceOrderById(id, actor);
  if (!result) throw new ServiceOrderDomainError("SERVICE_ORDER_NOT_FOUND");
  return result;
}
