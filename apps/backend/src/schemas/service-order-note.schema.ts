import { z } from "zod";

export const SERVICE_ORDER_NOTE_MAX_LENGTH = 2000;

export const createServiceOrderNoteSchema = z.object({
  content: z.string({ error: "Informe a nota interna" })
    .trim()
    .min(1, "A nota interna não pode ficar em branco")
    .max(
      SERVICE_ORDER_NOTE_MAX_LENGTH,
      `A nota interna deve ter no máximo ${SERVICE_ORDER_NOTE_MAX_LENGTH} caracteres`,
    ),
}).strict();

export const listServiceOrderNotesQuerySchema = z.object({
  page: z.coerce.number({ error: "Página inválida" })
    .int("A página deve ser um número inteiro")
    .min(1, "A página deve ser maior ou igual a 1")
    .default(1),
  limit: z.coerce.number({ error: "Limite inválido" })
    .int("O limite deve ser um número inteiro")
    .min(1, "O limite deve ser maior ou igual a 1")
    .max(100, "O limite deve ser menor ou igual a 100")
    .default(20),
}).strict();

export type CreateServiceOrderNoteInput = z.infer<typeof createServiceOrderNoteSchema>;
export type ListServiceOrderNotesQuery = z.infer<typeof listServiceOrderNotesQuerySchema>;
