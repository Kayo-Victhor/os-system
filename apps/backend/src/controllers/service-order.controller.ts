import type { Request, Response } from "express";

import {
  createServiceOrder,
  listServiceOrders,
  getServiceOrderById,
  updateServiceOrder,
  deleteServiceOrder,
  assignTechnician,
  updateServiceOrderStatus,
  listAssignableTechnicians,
  ServiceOrderDomainError,
  type ServiceOrderActor,
} from "../services/service-order.service.js";

import {
  createServiceOrderSchema,
  updateServiceOrderSchema,
  assignTechnicianSchema,
  updateServiceOrderStatusSchema,
  listServiceOrdersQuerySchema,
  serviceOrderIdSchema,
} from "../schemas/service-order.schema.js";

import type { AuthenticatedRequest } from "../middlewares/auth.middleware.js";

import { mapPrismaError } from "../lib/prisma-errors.js";

function authenticatedActor(
  req: AuthenticatedRequest,
  res: Response,
): ServiceOrderActor | null {
  if (!req.userId || !req.userRole) {
    res.status(401).json({ error: "Usuário não autenticado" });
    return null;
  }
  return { userId: req.userId, role: req.userRole };
}

function validServiceOrderId(rawId: string, res: Response): string | null {
  const parsed = serviceOrderIdSchema.safeParse(rawId);
  if (!parsed.success) {
    res.status(404).json({ error: "Ordem de serviço não encontrada" });
    return null;
  }
  return parsed.data;
}

function respondToDomainError(error: unknown, res: Response): boolean {
  if (!(error instanceof ServiceOrderDomainError)) return false;

  const responses: Record<
    ServiceOrderDomainError["code"],
    { status: number; error: string }
  > = {
    CUSTOMER_NOT_FOUND: { status: 400, error: "Cliente informado não existe" },
    SERVICE_ORDER_NOT_FOUND: { status: 404, error: "Ordem de serviço não encontrada" },
    TECHNICIAN_INVALID: { status: 400, error: "Usuário informado não é um técnico" },
    STATUS_FORBIDDEN: { status: 403, error: "Você não pode realizar esta alteração de status" },
    INVALID_STATUS_TRANSITION: { status: 409, error: "Transição de status não permitida" },
    STATUS_CONFLICT: { status: 409, error: "O status foi alterado por outra operação. Recarregue e tente novamente." },
    ASSIGNMENT_CONFLICT: { status: 409, error: "A atribuição foi alterada por outra operação. Recarregue e tente novamente." },
  };
  const response = responses[error.code];
  res.status(response.status).json({ error: response.error });
  return true;
}

// =====================================================
// CRIAR OS
// =====================================================

export async function createServiceOrderController(
  req: AuthenticatedRequest,
  res: Response,
) {
  const result = createServiceOrderSchema.safeParse(req.body);

  if (!result.success) {
    res.status(400).json({
      error: "Dados inválidos",
      details: result.error.flatten(),
    });

    return;
  }

  const actor = authenticatedActor(req, res);
  if (!actor) return;

  try {
    const serviceOrder = await createServiceOrder(result.data, actor.userId);

    res.status(201).json(serviceOrder);
  } catch (error) {
    if (respondToDomainError(error, res)) return;
    const known = mapPrismaError(error);

    if (known) {
      res.status(known.status).json(known.body);
      return;
    }

    console.error(error);

    res.status(500).json({
      error: "Erro ao criar ordem de serviço",
    });
  }
}

// =====================================================
// LISTAR OS
// =====================================================

export async function listServiceOrdersController(
  req: AuthenticatedRequest,
  res: Response,
) {
  const result = listServiceOrdersQuerySchema.safeParse(req.query);

  if (!result.success) {
    res.status(400).json({
      error: "Filtros inválidos",
      details: result.error.flatten(),
    });

    return;
  }

  const actor = authenticatedActor(req, res);
  if (!actor) return;

  try {
    const serviceOrders = await listServiceOrders(result.data, actor);

    res.json(serviceOrders);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Erro ao listar ordens de serviço",
    });
  }
}

// =====================================================
// BUSCAR OS POR ID
// =====================================================

export async function getServiceOrderByIdController(
  req: AuthenticatedRequest & Request<{ id: string }>,
  res: Response,
) {
  const actor = authenticatedActor(req, res);
  if (!actor) return;
  const serviceOrderId = validServiceOrderId(req.params.id, res);
  if (!serviceOrderId) return;

  try {
    const serviceOrder = await getServiceOrderById(serviceOrderId, actor);

    if (!serviceOrder) {
      res.status(404).json({
        error: "Ordem de serviço não encontrada",
      });

      return;
    }

    res.json(serviceOrder);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Erro ao buscar ordem de serviço",
    });
  }
}

// =====================================================
// ATUALIZAR OS
// =====================================================

export async function updateServiceOrderController(
  req: Request<{ id: string }>,
  res: Response,
) {
  const serviceOrderId = validServiceOrderId(req.params.id, res);
  if (!serviceOrderId) return;
  const result = updateServiceOrderSchema.safeParse(req.body);

  if (!result.success) {
    res.status(400).json({
      error: "Dados inválidos",
      details: result.error.flatten(),
    });

    return;
  }

  try {
    const serviceOrder = await getServiceOrderById(serviceOrderId);

    if (!serviceOrder) {
      res.status(404).json({
        error: "Ordem de serviço não encontrada",
      });

      return;
    }

    const updatedServiceOrder = await updateServiceOrder(
      serviceOrderId,
      result.data,
    );

    res.json(updatedServiceOrder);
  } catch (error) {
    const known = mapPrismaError(error);

    if (known) {
      res.status(known.status).json(known.body);
      return;
    }

    console.error(error);

    res.status(500).json({
      error: "Erro ao atualizar ordem de serviço",
    });
  }
}

// =====================================================
// EXCLUIR OS
// =====================================================

export async function deleteServiceOrderController(
  req: Request<{ id: string }>,
  res: Response,
) {
  const serviceOrderId = validServiceOrderId(req.params.id, res);
  if (!serviceOrderId) return;
  try {
    const serviceOrder = await getServiceOrderById(serviceOrderId);

    if (!serviceOrder) {
      res.status(404).json({
        error: "Ordem de serviço não encontrada",
      });

      return;
    }

    await deleteServiceOrder(serviceOrderId);

    res.status(204).send();
  } catch (error) {
    const known = mapPrismaError(error);

    if (known) {
      res.status(known.status).json(known.body);
      return;
    }

    console.error(error);

    res.status(500).json({
      error: "Erro ao excluir ordem de serviço",
    });
  }
}

// =====================================================
// ATRIBUIR TÉCNICO
// =====================================================

export async function assignTechnicianController(
  req: Request<{ id: string }>,
  res: Response,
) {
  const serviceOrderId = validServiceOrderId(req.params.id, res);
  if (!serviceOrderId) return;
  const result = assignTechnicianSchema.safeParse(req.body);

  if (!result.success) {
    res.status(400).json({
      error: "Dados inválidos",
      details: result.error.flatten(),
    });

    return;
  }

  try {
    const updatedServiceOrder = await assignTechnician(
      serviceOrderId,
      result.data.technicianId,
    );

    res.json(updatedServiceOrder);
  } catch (error) {
    if (respondToDomainError(error, res)) return;
    const known = mapPrismaError(error);

    if (known) {
      res.status(known.status).json(known.body);
      return;
    }

    console.error(error);

    res.status(500).json({
      error: "Erro ao atribuir técnico",
    });
  }
}

// =====================================================
// ATUALIZAR STATUS
// =====================================================

export async function updateServiceOrderStatusController(
  req: AuthenticatedRequest & Request<{ id: string }>,
  res: Response,
) {
  const actor = authenticatedActor(req, res);
  if (!actor) return;
  const serviceOrderId = validServiceOrderId(req.params.id, res);
  if (!serviceOrderId) return;
  const result = updateServiceOrderStatusSchema.safeParse(req.body);

  if (!result.success) {
    res.status(400).json({
      error: "Dados inválidos",
      details: result.error.flatten(),
    });

    return;
  }

  try {
    const updatedServiceOrder = await updateServiceOrderStatus(
      serviceOrderId,
      result.data.status,
      actor,
    );

    res.json(updatedServiceOrder);
  } catch (error) {
    if (respondToDomainError(error, res)) return;
    const known = mapPrismaError(error);

    if (known) {
      res.status(known.status).json(known.body);
      return;
    }

    console.error(error);

    res.status(500).json({
      error: "Erro ao atualizar status da ordem de serviço",
    });
  }
}

export async function listAssignableTechniciansController(
  _req: Request,
  res: Response,
) {
  try {
    res.json(await listAssignableTechnicians());
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao listar técnicos disponíveis" });
  }
}
