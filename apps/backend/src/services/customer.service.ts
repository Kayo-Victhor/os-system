import { prisma } from "../lib/prisma.js";
import type { CreateCustomerInput } from "../schemas/customer.schema.js";

export async function createCustomer(data: CreateCustomerInput) {
  return prisma.customer.create({
    data
  });
}

export async function listCustomers() {
  return prisma.customer.findMany({
    orderBy: {
      createdAt: "desc"
    }
  });
}

export async function getCustomerById(id: string) {
  return prisma.customer.findUnique({
    where: { id }
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