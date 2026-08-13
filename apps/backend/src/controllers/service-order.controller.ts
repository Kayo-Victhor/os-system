import type { Request, Response } from "express";

import {
  createServiceOrder,
  listServiceOrders,
  getServiceOrderById,
  updateServiceOrder,
  deleteServiceOrder,
  assignTechnician,
  updateServiceOrderStatus,
} from "../services/service-order.service.js";

import {
  createServiceOrderSchema,
  updateServiceOrderSchema,
  assignTechnicianSchema,
  updateServiceOrderStatusSchema,
  listServiceOrdersQuerySchema,
} from "../schemas/service-order.schema.js";

import type { AuthenticatedRequest } from "../middlewares/auth.middleware.js";

import { prisma } from "../lib/prisma.js";

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

  if (!req.userId) {
    res.status(401).json({
      error: "Usuário não autenticado",
    });

    return;
  }

  try {
    const serviceOrder = await createServiceOrder(result.data, req.userId);

    res.status(201).json(serviceOrder);
  } catch (error) {
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
  req: Request,
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

  try {
    const serviceOrders = await listServiceOrders(result.data);

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
  req: Request<{ id: string }>,
  res: Response,
) {
  try {
    const serviceOrder = await getServiceOrderById(req.params.id);

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
  const result = updateServiceOrderSchema.safeParse(req.body);

  if (!result.success) {
    res.status(400).json({
      error: "Dados inválidos",
      details: result.error.flatten(),
    });

    return;
  }

  try {
    const serviceOrder = await getServiceOrderById(req.params.id);

    if (!serviceOrder) {
      res.status(404).json({
        error: "Ordem de serviço não encontrada",
      });

      return;
    }

    const updatedServiceOrder = await updateServiceOrder(
      req.params.id,
      result.data,
    );

    res.json(updatedServiceOrder);
  } catch (error) {
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
  try {
    const serviceOrder = await getServiceOrderById(req.params.id);

    if (!serviceOrder) {
      res.status(404).json({
        error: "Ordem de serviço não encontrada",
      });

      return;
    }

    await deleteServiceOrder(req.params.id);

    res.status(204).send();
  } catch (error) {
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
  const result = assignTechnicianSchema.safeParse(req.body);

  if (!result.success) {
    res.status(400).json({
      error: "Dados inválidos",
      details: result.error.flatten(),
    });

    return;
  }

  try {
    const serviceOrder = await getServiceOrderById(req.params.id);

    if (!serviceOrder) {
      res.status(404).json({
        error: "Ordem de serviço não encontrada",
      });

      return;
    }

    if (result.data.technicianId) {
      const technician = await prisma.user.findUnique({
        where: {
          id: result.data.technicianId,
        },
      });

      if (!technician || technician.role !== "TECHNICIAN") {
        res.status(400).json({
          error: "Usuário informado não é um técnico",
        });

        return;
      }
    }

    const updatedServiceOrder = await assignTechnician(
      req.params.id,
      result.data.technicianId,
    );

    res.json(updatedServiceOrder);
  } catch (error) {
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
  const result = updateServiceOrderStatusSchema.safeParse(req.body);

  if (!result.success) {
    res.status(400).json({
      error: "Dados inválidos",
      details: result.error.flatten(),
    });

    return;
  }

  try {
    const serviceOrder = await getServiceOrderById(req.params.id);

    if (!serviceOrder) {
      res.status(404).json({
        error: "Ordem de serviço não encontrada",
      });

      return;
    }

    // OS_UPDATE_STATUS lets a TECHNICIAN update status in general, but that
    // must not extend to orders assigned to someone else — otherwise any
    // technician could change the state of any order in the system just by
    // knowing/guessing its id.
    if (
      req.userRole === "TECHNICIAN" &&
      serviceOrder.technicianId !== req.userId
    ) {
      res.status(403).json({
        error: "Você só pode atualizar o status de ordens atribuídas a você",
      });

      return;
    }

    const updatedServiceOrder = await updateServiceOrderStatus(
      req.params.id,
      result.data.status,
    );

    res.json(updatedServiceOrder);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Erro ao atualizar status da ordem de serviço",
    });
  }
}
