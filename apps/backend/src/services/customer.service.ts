import { prisma } from "../lib/prisma.js";
import type { CreateCustomerInput } from "../schemas/customer.schema.js";
import type { Prisma } from "../generated/prisma/client.js";

export async function createCustomer(data: CreateCustomerInput) {
  return prisma.customer.create({
    data
  });
}

export interface ListCustomersFilters {
  search?: string;
}

export async function listCustomers(filters: ListCustomersFilters = {}) {
  const where: Prisma.CustomerWhereInput = filters.search
    ? {
        OR: [
          { name: { contains: filters.search, mode: "insensitive" } },
          { email: { contains: filters.search, mode: "insensitive" } },
          { document: { contains: filters.search, mode: "insensitive" } },
        ],
      }
    : {};

  return prisma.customer.findMany({
    where,
    orderBy: {
      createdAt: "desc"
    }
  });
}

export async function listCustomersForTechnician(
  technicianId: string,
  filters: ListCustomersFilters = {},
) {
  const searchWhere: Prisma.CustomerWhereInput = filters.search
    ? {
        OR: [
          { name: { contains: filters.search, mode: "insensitive" } },
          { email: { contains: filters.search, mode: "insensitive" } },
          { document: { contains: filters.search, mode: "insensitive" } },
        ],
      }
    : {};

  return prisma.customer.findMany({
    where: {
      ...searchWhere,
      serviceOrders: { some: { technicianId } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getCustomerById(id: string) {
  return prisma.customer.findUnique({ where: { id } });
}

export async function getCustomerByIdForTechnician(id: string, technicianId: string) {
  return prisma.customer.findFirst({
    where: {
      id,
      serviceOrders: { some: { technicianId } },
    },
  });
}

export async function updateCustomer(
  id: string,
  data: Partial<CreateCustomerInput>
) {
  return prisma.customer.update({
    where: { id },
    data
  });
}

export async function deleteCustomer(id: string) {
  return prisma.customer.delete({
    where: { id }
  });
}
