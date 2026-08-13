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
});

export const updateServiceOrderSchema = z.object({
  title: z.string().min(3).max(150).optional(),

  description: z.string().min(5).optional(),

  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
});

export const updateServiceOrderStatusSchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "WAITING", "COMPLETED", "CANCELLED"]),
});

export const assignTechnicianSchema = z.object({
  technicianId: z.string().uuid().nullable(),
});

export const listServiceOrdersQuerySchema = z.object({
  status: z
    .enum(["OPEN", "IN_PROGRESS", "WAITING", "COMPLETED", "CANCELLED"])
    .optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).optional(),
  customerId: z.string().uuid().optional(),
  technicianId: z.string().uuid().optional(),
  search: z.string().min(1).max(150).optional(),
});

export type CreateServiceOrderInput = z.infer<typeof createServiceOrderSchema>;

export type UpdateServiceOrderInput = z.infer<typeof updateServiceOrderSchema>;
