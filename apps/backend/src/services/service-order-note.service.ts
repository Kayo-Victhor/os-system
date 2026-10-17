import { prisma } from "../lib/prisma.js";
import type { Prisma } from "../generated/prisma/client.js";
import type {
  CreateServiceOrderNoteInput,
  ListServiceOrderNotesQuery,
} from "../schemas/service-order-note.schema.js";
import {
  ServiceOrderDomainError,
  type ServiceOrderActor,
} from "./service-order.service.js";

const serviceOrderNoteSelect = {
  id: true,
  content: true,
  createdAt: true,
  author: { select: { id: true, name: true } },
} satisfies Prisma.ServiceOrderNoteSelect;

function accessibleOrderWhere(
  serviceOrderId: string,
  actor: ServiceOrderActor,
): Prisma.ServiceOrderWhereInput {
  return {
    id: serviceOrderId,
    ...(actor.role === "TECHNICIAN" ? { technicianId: actor.userId } : {}),
  };
}

export async function createServiceOrderNote(
  serviceOrderId: string,
  input: CreateServiceOrderNoteInput,
  actor: ServiceOrderActor,
) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.serviceOrder.findFirst({
      where: accessibleOrderWhere(serviceOrderId, actor),
      select: { id: true },
    });
    if (!order) throw new ServiceOrderDomainError("SERVICE_ORDER_NOT_FOUND");

    return tx.serviceOrderNote.create({
      data: {
        serviceOrderId: order.id,
        authorId: actor.userId,
        content: input.content,
      },
      select: serviceOrderNoteSelect,
    });
  });
}

export async function listServiceOrderNotes(
  serviceOrderId: string,
  query: ListServiceOrderNotesQuery,
  actor: ServiceOrderActor,
) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.serviceOrder.findFirst({
      where: accessibleOrderWhere(serviceOrderId, actor),
      select: { id: true },
    });
    if (!order) throw new ServiceOrderDomainError("SERVICE_ORDER_NOT_FOUND");

    const where = { serviceOrderId: order.id };
    const items = await tx.serviceOrderNote.findMany({
      where,
      skip: (query.page - 1) * query.limit,
      take: query.limit,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: serviceOrderNoteSelect,
    });
    const total = await tx.serviceOrderNote.count({ where });
    const totalPages = Math.ceil(total / query.limit);

    return {
      items,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages,
        hasPreviousPage: query.page > 1,
        hasNextPage: query.page < totalPages,
      },
    };
  });
}
