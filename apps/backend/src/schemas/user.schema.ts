import { z } from "zod";
import { normalizeEmail } from "../lib/email.js";

export const passwordSchema = z.string().min(8, "A senha deve ter pelo menos 8 caracteres").max(128);

export const createUserSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: passwordSchema,
  role: z.enum(["ADMIN", "ATTENDANT", "TECHNICIAN"]).default("ATTENDANT")
});

export const updateUserSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  email: z.string().email().optional(),
  role: z.enum(["ADMIN", "ATTENDANT", "TECHNICIAN"]).optional(),
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
