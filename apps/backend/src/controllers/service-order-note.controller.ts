import type { Request, Response } from "express";

import type { AuthenticatedRequest } from "../middlewares/auth.middleware.js";
import { serviceOrderIdSchema } from "../schemas/service-order.schema.js";
import {
  createServiceOrderNoteSchema,
  listServiceOrderNotesQuerySchema,
} from "../schemas/service-order-note.schema.js";
import {
  createServiceOrderNote,
  listServiceOrderNotes,
} from "../services/service-order-note.service.js";
import {
  ServiceOrderDomainError,
  type ServiceOrderActor,
} from "../services/service-order.service.js";

function parseContext(
  req: AuthenticatedRequest & Request<{ id: string }>,
  res: Response,
): { actor: ServiceOrderActor; serviceOrderId: string } | null {
  if (!req.userId || !req.userRole) {
    res.status(401).json({ error: "Usuário não autenticado" });
    return null;
  }
  const serviceOrderId = serviceOrderIdSchema.safeParse(req.params.id);
  if (!serviceOrderId.success) {
    res.status(404).json({ error: "Ordem de serviço não encontrada" });
    return null;
  }
  return {
    actor: { userId: req.userId, role: req.userRole },
    serviceOrderId: serviceOrderId.data,
  };
}

function respondToError(error: unknown, res: Response, fallback: string) {
  if (
    error instanceof ServiceOrderDomainError &&
    error.code === "SERVICE_ORDER_NOT_FOUND"
  ) {
    res.status(404).json({ error: "Ordem de serviço não encontrada" });
    return;
  }
  console.error(error);
  res.status(500).json({ error: fallback });
}

export async function createServiceOrderNoteController(
  req: AuthenticatedRequest & Request<{ id: string }>,
  res: Response,
) {
  const context = parseContext(req, res);
  if (!context) return;
  const input = createServiceOrderNoteSchema.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({
      error: "Dados inválidos",
      details: input.error.flatten(),
    });
    return;
  }

  try {
    const note = await createServiceOrderNote(
      context.serviceOrderId,
      input.data,
      context.actor,
    );
    res.status(201).json(note);
  } catch (error) {
    respondToError(error, res, "Erro ao registrar nota interna");
  }
}

export async function listServiceOrderNotesController(
  req: AuthenticatedRequest & Request<{ id: string }>,
  res: Response,
) {
  const context = parseContext(req, res);
  if (!context) return;
  const query = listServiceOrderNotesQuerySchema.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({
      error: "Filtros inválidos",
      details: query.error.flatten(),
    });
    return;
  }

  try {
    res.json(await listServiceOrderNotes(
      context.serviceOrderId,
      query.data,
      context.actor,
    ));
  } catch (error) {
    respondToError(error, res, "Erro ao carregar notas internas");
  }
}
