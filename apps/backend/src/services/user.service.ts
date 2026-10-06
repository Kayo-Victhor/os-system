import { prisma } from "../lib/prisma.js";
import { hashPassword } from "../lib/password.js";
import type { CreateUserInput, UpdateUserInput } from "../schemas/user.schema.js";

export const INTERNAL_USER_ROLES = ["ADMIN", "ATTENDANT", "TECHNICIAN"] as const;
export type InternalUserRole = (typeof INTERNAL_USER_ROLES)[number];

export async function createUser(data: CreateUserInput) {
  const passwordHash = await hashPassword(data.password);

  return prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      password: passwordHash,
      role: data.role,
      isPrimaryAdmin: false,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isPrimaryAdmin: true,
      createdAt: true,
      updatedAt: true
    }
  });
}

export async function listUsers(filters: { role?: InternalUserRole } = {}) {
  return prisma.user.findMany({
    where: filters.role
      ? { role: filters.role }
      : undefined,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isPrimaryAdmin: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: {
      createdAt: "desc",
    },
  });
}

export async function getUserById(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isPrimaryAdmin: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return user && INTERNAL_USER_ROLES.includes(user.role as InternalUserRole)
    ? user
    : null;
}

export async function updateUser(id: string, data: UpdateUserInput) {
  return prisma.user.update({
    where: { id },
    data,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isPrimaryAdmin: true,
      createdAt: true,
      updatedAt: true,
    },
  });
}

export async function countAdmins(excludingUserId?: string) {
  return prisma.user.count({
    where: {
      role: "ADMIN",
      ...(excludingUserId ? { id: { not: excludingUserId } } : {}),
    },
  });
}

export async function deleteUser(id: string) {
  await prisma.user.delete({ where: { id } });
}

export function primaryAdminUpdateError(
  actorId: string | undefined,
  target: { id: string; isPrimaryAdmin: boolean },
  requestedRole: InternalUserRole | undefined,
): string | null {
  if (!target.isPrimaryAdmin) return null;
  if (actorId !== target.id) return "Apenas o administrador principal pode editar sua própria conta.";
  if (requestedRole && requestedRole !== "ADMIN") {
    return "O administrador principal não pode deixar de ser administrador.";
  }
  return null;
}

export function primaryAdminDeleteError(target: { isPrimaryAdmin: boolean }): string | null {
  return target.isPrimaryAdmin
    ? "O administrador principal não pode ser excluído."
    : null;
}
