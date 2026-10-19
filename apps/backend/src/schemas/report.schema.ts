import { z } from "zod";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isCalendarDate(value: string) {
  if (!DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function dayDifference(startDate: string, endDate: string) {
  return (
    Date.parse(`${endDate}T00:00:00.000Z`) -
    Date.parse(`${startDate}T00:00:00.000Z`)
  ) / 86_400_000;
}

const reportDateSchema = z.string({ error: "Informe uma data válida" })
  .refine(isCalendarDate, "Use uma data válida no formato AAAA-MM-DD");

export const operationalReportQuerySchema = z.object({
  startDate: reportDateSchema.optional(),
  endDate: reportDateSchema.optional(),
  status: z.enum(["OPEN", "IN_PROGRESS", "WAITING", "COMPLETED", "CANCELLED"], {
    error: "Status inválido",
  }).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"], {
    error: "Prioridade inválida",
  }).optional(),
}).strict().superRefine((data, context) => {
  if (Boolean(data.startDate) !== Boolean(data.endDate)) {
    context.addIssue({
      code: "custom",
      path: data.startDate ? ["endDate"] : ["startDate"],
      message: "Informe a data inicial e a data final",
    });
    return;
  }
  if (!data.startDate || !data.endDate) return;

  const difference = dayDifference(data.startDate, data.endDate);
  if (difference < 0) {
    context.addIssue({
      code: "custom",
      path: ["endDate"],
      message: "A data final deve ser igual ou posterior à data inicial",
    });
  } else if (difference > 365) {
    context.addIssue({
      code: "custom",
      path: ["endDate"],
      message: "O período deve ter no máximo 366 dias",
    });
  }
});

export type OperationalReportQuery = z.infer<typeof operationalReportQuerySchema>;
