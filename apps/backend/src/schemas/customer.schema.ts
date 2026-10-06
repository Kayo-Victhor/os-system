import { z } from "zod";

export const createCustomerSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email().optional(),
  phone: z.string().min(8).max(20).optional(),
  document: z.string().min(5).max(30).optional(),
  address: z.string().max(255).optional()
});

export const updateCustomerSchema =
  createCustomerSchema.partial();

export const customerAccountStatusSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED"]),
}).strict();

export const emptyCustomerLifecycleSchema = z.object({}).strict();

export const customerIdSchema = z.string().uuid();

export type CreateCustomerInput = z.infer<
  typeof createCustomerSchema
>;

export type CustomerAccountStatusInput = z.infer<
  typeof customerAccountStatusSchema
>;
