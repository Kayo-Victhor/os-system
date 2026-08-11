import { prisma } from "../lib/prisma.js";
import type { CreateCustomerInput } from "../schemas/customer.schema.js";

export async function createCustomer(data: CreateCustomerInput) {
  return prisma.customer.create({
    data,
  });
}

export async function listCustomers() {
  return prisma.customer.findMany({
    orderBy: {
      createdAt: "desc"
    }
  });
}