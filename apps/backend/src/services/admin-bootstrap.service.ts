import { z } from "zod";
import type { PrismaClient } from "../generated/prisma/client.js";
import { hashPassword } from "../lib/password.js";
import { passwordSchema } from "../schemas/user.schema.js";

const LEGACY_BOOTSTRAP_ADMIN_EMAIL = "admin@os-system.local";

type UserDelegate = Pick<PrismaClient["user"], "create" | "findMany" | "findUnique" | "update">;

export async function bootstrapPrimaryAdmin(
  user: UserDelegate,
  input: { email: string; password: string },
) {
  if (!z.string().email().safeParse(input.email).success) {
    throw new Error("ADMIN_EMAIL precisa conter um e-mail válido para executar o seed.");
  }

  if (!passwordSchema.safeParse(input.password).success) {
    throw new Error("SEED_ADMIN_PASSWORD precisa atender aos requisitos de senha para executar o seed.");
  }

  const primaryAdmins = await user.findMany({
    where: { isPrimaryAdmin: true },
    select: { id: true, email: true },
  });

  if (primaryAdmins.length > 1) {
    throw new Error("Foram encontrados múltiplos administradores principais.");
  }

  const configuredEmailUser = await user.findUnique({
    where: { email: input.email },
    select: { id: true, role: true },
  });

  const password = await hashPassword(input.password);
  const data = {
    email: input.email,
    password,
    role: "ADMIN" as const,
    isPrimaryAdmin: true,
    emailVerifiedAt: null,
  };

  if (primaryAdmins[0]) {
    const primaryAdmin = primaryAdmins[0];
    if (configuredEmailUser && configuredEmailUser.id !== primaryAdmin.id) {
      throw new Error("ADMIN_EMAIL já pertence a outra conta.");
    }

    return user.update({ where: { id: primaryAdmin.id }, data });
  }

  const legacyBootstrap = await user.findUnique({
    where: { email: LEGACY_BOOTSTRAP_ADMIN_EMAIL },
    select: { id: true, role: true },
  });

  if (legacyBootstrap) {
    if (legacyBootstrap.role !== "ADMIN") {
      throw new Error("O administrador bootstrap legado não possui role ADMIN.");
    }
    if (configuredEmailUser && configuredEmailUser.id !== legacyBootstrap.id) {
      throw new Error("ADMIN_EMAIL já pertence a outra conta.");
    }

    return user.update({ where: { id: legacyBootstrap.id }, data });
  }

  const existingAdmins = await user.findMany({
    where: { role: "ADMIN" },
    select: { id: true },
  });

  if (existingAdmins.length > 0) {
    throw new Error("Não foi possível identificar com segurança o administrador bootstrap existente.");
  }

  if (configuredEmailUser) {
    throw new Error("ADMIN_EMAIL já pertence a uma conta que não é administradora.");
  }

  return user.create({
    data: {
      name: "Administrador",
      ...data,
    },
  });
}
