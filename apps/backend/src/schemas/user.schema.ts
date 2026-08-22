import { z } from "zod";

export const createUserSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(6),
  role: z.enum(["USER", "TECHNICIAN"]).default("USER")
});

export const updateUserSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  email: z.string().email().optional(),
  role: z.enum(["ADMIN", "USER", "TECHNICIAN"]).optional(),
});

// No `role` field, on purpose. Zod's default behavior strips keys that
// aren't part of the schema, so a client sending { ..., "role": "ADMIN" }
// to the public register endpoint has that field silently dropped before
// it ever reaches the service layer — the created account is always
// CUSTOMER (see auth.service.ts#registerCustomer). This is stronger than
// validating-then-rejecting a role field: there's no code path where a
// role value from the request body can influence the created role at all.
export const registerSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z.string().min(6),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;