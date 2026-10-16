import { z } from "zod";
import { normalizeEmail } from "../lib/email.js";

export const passwordSchema = z
  .string({ error: "Informe a senha" })
  .min(8, "A senha deve ter pelo menos 8 caracteres")
  .max(128, "A senha deve ter no máximo 128 caracteres");

const internalUserRoleSchema = z.enum(["ADMIN", "ATTENDANT", "TECHNICIAN"], {
  error: "Selecione um papel interno válido",
});

export const createUserSchema = z.object({
  name: z.string({ error: "Informe o nome" })
    .min(2, "O nome deve ter pelo menos 2 caracteres")
    .max(100, "O nome deve ter no máximo 100 caracteres"),
  email: z.string({ error: "Informe o e-mail" }).email("Informe um e-mail válido"),
  password: passwordSchema,
  role: internalUserRoleSchema.default("ATTENDANT")
});

export const updateUserSchema = z.object({
  name: z.string({ error: "Informe um nome válido" })
    .min(2, "O nome deve ter pelo menos 2 caracteres")
    .max(100, "O nome deve ter no máximo 100 caracteres")
    .optional(),
  email: z.string({ error: "Informe um e-mail válido" }).email("Informe um e-mail válido").optional(),
  role: internalUserRoleSchema.optional(),
});

// No `role` field, on purpose. Zod strips unknown keys before the public
// request reaches the pending-registration service. The request therefore
// cannot create or influence any User role while awaiting e-mail ownership.
export const registerSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().transform(normalizeEmail).pipe(z.string().email()),
  password: passwordSchema,
  phone: z.string().min(8).max(30).optional(),
  document: z.string().min(3).max(40).optional(),
  address: z.string().min(3).max(255).optional(),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
