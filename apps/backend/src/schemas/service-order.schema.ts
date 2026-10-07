import { z } from "zod";

export const createServiceOrderSchema = z.object({
  title: z
    .string()
    .min(3, "O título deve ter pelo menos 3 caracteres")
    .max(150),

  description: z
    .string()
    .min(5, "A descrição deve ter pelo menos 5 caracteres"),

  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),

  customerId: z.string().uuid("ID do cliente inválido"),
}).strict();

export const updateServiceOrderSchema = z.object({
  title: z.string().min(3).max(150).optional(),

  description: z.string().min(5).optional(),

  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
}).strict().refine((data) => Object.keys(data).length > 0, {
  message: "Informe ao menos um campo para atualização",
});

export const updateServiceOrderStatusSchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "WAITING", "COMPLETED", "CANCELLED"]),
}).strict();

export const assignTechnicianSchema = z.object({
  technicianId: z.string().uuid().nullable(),
}).strict();

export const listServiceOrdersQuerySchema = z.object({
  status: z
    .enum(["OPEN", "IN_PROGRESS", "WAITING", "COMPLETED", "CANCELLED"])
    .optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  customerId: z.string().uuid().optional(),
  technicianId: z.string().uuid().optional(),
  search: z.string().min(1).max(150).optional(),
}).strict();

export const serviceOrderIdSchema = z.string().uuid();

export type CreateServiceOrderInput = z.infer<typeof createServiceOrderSchema>;

export type UpdateServiceOrderInput = z.infer<typeof updateServiceOrderSchema>;
