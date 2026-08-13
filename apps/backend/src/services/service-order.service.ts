import { prisma } from "../lib/prisma.js";
import type {
  CreateServiceOrderInput,
  UpdateServiceOrderInput,
} from "../schemas/service-order.schema.js";

import type {
  ServiceOrderStatus,
  ServiceOrderPriority,
  Prisma,
} from "../generated/prisma/client.js";

export async function createServiceOrder(
  data: CreateServiceOrderInput,
  createdById: string,
) {
  return prisma.serviceOrder.create({
    data: {
      title: data.title,
      description: data.description,
      priority: data.priority,
      customerId: data.customerId,
      createdById,
    },
  });
}

export interface ListServiceOrdersFilters {
  status?: ServiceOrderStatus;
  priority?: ServiceOrderPriority;
  customerId?: string;
  technicianId?: string;
  search?: string;
}

export async function listServiceOrders(filters: ListServiceOrdersFilters = {}) {
  const where: Prisma.ServiceOrderWhereInput = {
    status: filters.status,
    priority: filters.priority,
    customerId: filters.customerId,
    technicianId: filters.technicianId,
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
    orderBy: {
      createdAt: "desc",
    },

    include: {
      customer: true,
      technician: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      },
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      },
    },
  });
}

export async function getServiceOrderById(id: string) {
  return prisma.serviceOrder.findUnique({
    where: {
      id,
    },

    include: {
      customer: true,

      technician: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      },

      createdBy: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      },
    },
  });
}

export async function updateServiceOrder(
  id: string,
  data: UpdateServiceOrderInput,
) {
  return prisma.serviceOrder.update({
    where: {
      id,
    },

    data,
  });
}

export async function deleteServiceOrder(id: string) {
  return prisma.serviceOrder.delete({
    where: {
      id,
    },
  });
}

export async function assignTechnician(
  id: string,
  technicianId: string | null,
) {
  return prisma.serviceOrder.update({
    where: {
      id,
    },
    data: {
      technicianId,
    },
  });
}

export async function updateServiceOrderStatus(
  id: string,
  status: ServiceOrderStatus,
) {
  return prisma.serviceOrder.update({
    where: {
      id,
    },
    data: {
      status,
    },
  });
}
