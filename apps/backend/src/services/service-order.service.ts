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

const internalEventSelect = {
  id: true,
  type: true,
  changedFields: true,
  previousStatus: true,
  newStatus: true,
  previousPriority: true,
  newPriority: true,
  previousTechnicianId: true,
  newTechnicianId: true,
  createdAt: true,
  actor: { select: { id: true, name: true } },
} satisfies Prisma.ServiceOrderEventSelect;

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
  return prisma.$transaction(async (tx) => {
    const customer = await tx.customer.findUnique({
      where: { id: data.customerId },
      select: { id: true },
    });
    if (!customer) throw new ServiceOrderDomainError("CUSTOMER_NOT_FOUND");

    const order = await tx.serviceOrder.create({
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
    await tx.serviceOrderEvent.create({
      data: {
        serviceOrderId: order.id,
        actorId: createdById,
        type: "CREATED",
        newStatus: "OPEN",
        newPriority: data.priority,
      },
    });
    return order;
  });
}

export interface ListServiceOrdersFilters {
  page: number;
  limit: number;
  status?: ServiceOrderStatus;
  priority?: ServiceOrderPriority;
  customerId?: string;
  technicianId?: string;
  search?: string;
}

export async function listServiceOrders(
  filters: ListServiceOrdersFilters,
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

  const [items, total] = await prisma.$transaction([
    prisma.serviceOrder.findMany({
      where,
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: serviceOrderSelect,
    }),
    prisma.serviceOrder.count({ where }),
  ]);
  const totalPages = Math.ceil(total / filters.limit);

  return {
    items,
    pagination: {
      page: filters.page,
      limit: filters.limit,
      total,
      totalPages,
      hasPreviousPage: filters.page > 1,
      hasNextPage: filters.page < totalPages,
    },
  };
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
  actorId: string,
) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.serviceOrder.findUnique({
      where: { id },
      select: { id: true, title: true, description: true, priority: true },
    });
    if (!current) throw new ServiceOrderDomainError("SERVICE_ORDER_NOT_FOUND");

    const changedFields = (Object.keys(data) as Array<keyof UpdateServiceOrderInput>)
      .filter((field) => data[field] !== current[field]);
    if (changedFields.length === 0) {
      return tx.serviceOrder.findUniqueOrThrow({ where: { id }, select: serviceOrderSelect });
    }

    const updated = await tx.serviceOrder.update({
      where: { id },
      data,
      select: serviceOrderSelect,
    });
    await tx.serviceOrderEvent.create({
      data: {
        serviceOrderId: id,
        actorId,
        type: "OPERATIONAL_UPDATED",
        changedFields,
        previousPriority: changedFields.includes("priority") ? current.priority : null,
        newPriority: changedFields.includes("priority") ? updated.priority : null,
      },
    });
    return updated;
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
  actorId: string,
) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.serviceOrder.findUnique({
      where: { id },
      select: { id: true, technicianId: true },
    });
    if (!order) throw new ServiceOrderDomainError("SERVICE_ORDER_NOT_FOUND");

    if (technicianId) {
      const technician = await tx.user.findUnique({
        where: { id: technicianId },
        select: { id: true, role: true },
      });
      if (!technician || technician.role !== "TECHNICIAN") {
        throw new ServiceOrderDomainError("TECHNICIAN_INVALID");
      }
    }

    if (order.technicianId === technicianId) {
      return tx.serviceOrder.findUniqueOrThrow({ where: { id }, select: serviceOrderSelect });
    }

    const updated = await tx.serviceOrder.updateMany({
      where: { id, technicianId: order.technicianId },
      data: { technicianId },
    });
    if (updated.count !== 1) {
      throw new ServiceOrderDomainError("ASSIGNMENT_CONFLICT");
    }

    await tx.serviceOrderEvent.create({
      data: {
        serviceOrderId: id,
        actorId,
        type: order.technicianId === null
          ? "TECHNICIAN_ASSIGNED"
          : technicianId === null
            ? "TECHNICIAN_UNASSIGNED"
            : "TECHNICIAN_REASSIGNED",
        previousTechnicianId: order.technicianId,
        newTechnicianId: technicianId,
      },
    });
    return tx.serviceOrder.findUniqueOrThrow({ where: { id }, select: serviceOrderSelect });
  });
}

export async function updateServiceOrderStatus(
  id: string,
  status: ServiceOrderStatus,
  actor: ServiceOrderActor,
) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.serviceOrder.findFirst({
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

    const updated = await tx.serviceOrder.updateMany({
      where: { id, status: order.status, ...technicianScope(actor) },
      data: { status },
    });
    if (updated.count !== 1) throw new ServiceOrderDomainError("STATUS_CONFLICT");

    await tx.serviceOrderEvent.create({
      data: {
        serviceOrderId: id,
        actorId: actor.userId,
        type: "STATUS_CHANGED",
        previousStatus: order.status,
        newStatus: status,
      },
    });
    return tx.serviceOrder.findUniqueOrThrow({ where: { id }, select: serviceOrderSelect });
  });
}

function technicianIdsFromEvents(events: Array<{
  previousTechnicianId: string | null;
  newTechnicianId: string | null;
}>) {
  return [...new Set(events.flatMap((event) => [
    event.previousTechnicianId,
    event.newTechnicianId,
  ]).filter((id): id is string => Boolean(id)))];
}

export async function listServiceOrderEvents(id: string, actor: ServiceOrderActor) {
  const order = await prisma.serviceOrder.findFirst({
    where: { id, ...technicianScope(actor) },
    select: { id: true },
  });
  if (!order) throw new ServiceOrderDomainError("SERVICE_ORDER_NOT_FOUND");

  const events = await prisma.serviceOrderEvent.findMany({
    where: { serviceOrderId: id },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: internalEventSelect,
  });
  const technicians = await prisma.user.findMany({
    where: { id: { in: technicianIdsFromEvents(events) } },
    select: { id: true, name: true },
  });
  const technicianNames = new Map(technicians.map((technician) => [technician.id, technician.name]));

  return events.map((event) => ({
    ...event,
    previousTechnician: event.previousTechnicianId
      ? { id: event.previousTechnicianId, name: technicianNames.get(event.previousTechnicianId) ?? "Técnico removido" }
      : null,
    newTechnician: event.newTechnicianId
      ? { id: event.newTechnicianId, name: technicianNames.get(event.newTechnicianId) ?? "Técnico removido" }
      : null,
  }));
}
