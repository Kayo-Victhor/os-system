import { z } from "zod";

export const createServiceOrderSchema = z.object({
  title: z
    .string({ error: "Informe o título" })
    .min(3, "O título deve ter pelo menos 3 caracteres")
    .max(150, "O título deve ter no máximo 150 caracteres"),

  description: z
    .string({ error: "Informe a descrição" })
    .min(5, "A descrição deve ter pelo menos 5 caracteres"),

  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"], {
    error: "Selecione uma prioridade válida",
  }).default("MEDIUM"),

  customerId: z.string({ error: "Informe o cliente" }).uuid("ID do cliente inválido"),
}).strict();

export const updateServiceOrderSchema = z.object({
  title: z.string({ error: "Informe um título válido" })
    .min(3, "O título deve ter pelo menos 3 caracteres")
    .max(150, "O título deve ter no máximo 150 caracteres")
    .optional(),

  description: z.string({ error: "Informe uma descrição válida" })
    .min(5, "A descrição deve ter pelo menos 5 caracteres")
    .optional(),

  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"], {
    error: "Selecione uma prioridade válida",
  }).optional(),
}).strict().refine((data) => Object.keys(data).length > 0, {
  message: "Informe ao menos um campo para atualização",
});

export const updateServiceOrderStatusSchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "WAITING", "COMPLETED", "CANCELLED"], {
    error: "Selecione um status válido",
  }),
}).strict();

export const assignTechnicianSchema = z.object({
  technicianId: z.string({ error: "ID do técnico inválido" })
    .uuid("ID do técnico inválido")
    .nullable(),
}).strict();

export const listServiceOrdersQuerySchema = z.object({
  status: z
    .enum(["OPEN", "IN_PROGRESS", "WAITING", "COMPLETED", "CANCELLED"], {
      error: "Status inválido",
    })
    .optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"], {
    error: "Prioridade inválida",
  }).optional(),
  customerId: z.string({ error: "ID do cliente inválido" })
    .uuid("ID do cliente inválido")
    .optional(),
  technicianId: z.string({ error: "ID do técnico inválido" })
    .uuid("ID do técnico inválido")
    .optional(),
  search: z.string({ error: "Pesquisa inválida" })
    .min(1, "Informe um termo para pesquisar")
    .max(150, "A pesquisa deve ter no máximo 150 caracteres")
    .optional(),
}).strict();

export const serviceOrderIdSchema = z.string().uuid("ID da ordem de serviço inválido");

export type CreateServiceOrderInput = z.infer<typeof createServiceOrderSchema>;

export type UpdateServiceOrderInput = z.infer<typeof updateServiceOrderSchema>;
