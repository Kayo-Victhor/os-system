import type { Response } from "express";

import type { AuthenticatedRequest } from "../middlewares/auth.middleware.js";
import { operationalReportQuerySchema } from "../schemas/report.schema.js";
import {
  getOperationalReport,
  resolveOperationalReportFilters,
} from "../services/report.service.js";

export async function operationalReportController(
  req: AuthenticatedRequest,
  res: Response,
) {
  const query = operationalReportQuerySchema.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({
      error: "Filtros inválidos",
      details: query.error.flatten(),
    });
    return;
  }

  try {
    res.json(await getOperationalReport(resolveOperationalReportFilters(query.data)));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao carregar relatório operacional" });
  }
}
