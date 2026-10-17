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

export const listCustomersQuerySchema = z.object({
  page: z.coerce.number({ error: "Página inválida" })
    .int("A página deve ser um número inteiro")
    .min(1, "A página deve ser maior ou igual a 1")
    .default(1),
  limit: z.coerce.number({ error: "Limite inválido" })
    .int("O limite deve ser um número inteiro")
    .min(1, "O limite deve ser maior ou igual a 1")
    .max(100, "O limite deve ser menor ou igual a 100")
    .default(20),
  search: z.string({ error: "Pesquisa inválida" })
    .trim()
    .min(1, "Informe um termo para pesquisar")
    .max(150, "A pesquisa deve ter no máximo 150 caracteres")
    .optional(),
}).strict();

export type CreateCustomerInput = z.infer<
  typeof createCustomerSchema
>;

export type CustomerAccountStatusInput = z.infer<
  typeof customerAccountStatusSchema
>;
