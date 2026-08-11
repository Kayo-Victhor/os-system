import { prisma } from "../lib/prisma.js";
import type {
  CreateServiceOrderInput,
  UpdateServiceOrderInput,
} from "../schemas/service-order.schema.js";

import type { ServiceOrderStatus } from "../generated/prisma/client.js";

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

export async function listServiceOrders() {
  return prisma.serviceOrder.findMany({
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
