import { prisma } from "../lib/prisma.js";
import { hashPassword } from "../lib/password.js";
import type { CreateUserInput } from "../schemas/user.schema.js";

export async function createUser(data: CreateUserInput) {
  const passwordHash = await hashPassword(data.password);

  return prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      password: passwordHash,
      role: data.role
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
      updatedAt: true
    }
  });
}

export async function listUsers(filters: { role?: "ADMIN" | "USER" | "TECHNICIAN" } = {}) {
  return prisma.user.findMany({
    where: filters.role ? { role: filters.role } : {},
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}
