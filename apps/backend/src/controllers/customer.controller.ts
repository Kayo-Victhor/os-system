import type { Request, Response } from "express";

import {
  createCustomer,
  listCustomers,
  listCustomersForTechnician,
  getCustomerById,
  getCustomerByIdForTechnician,
  updateCustomer,
  deleteCustomer,
  setCustomerAccountStatus,
  deleteCustomerAccount,
  anonymizeCustomer,
  CustomerLifecycleError,
} from "../services/customer.service.js";

import {
  createCustomerSchema,
  updateCustomerSchema,
  customerAccountStatusSchema,
  customerIdSchema,
  emptyCustomerLifecycleSchema,
} from "../schemas/customer.schema.js";

import { mapPrismaError } from "../lib/prisma-errors.js";
import type { AuthenticatedRequest } from "../middlewares/auth.middleware.js";

function validCustomerId(rawId: string, res: Response): string | null {
  const parsed = customerIdSchema.safeParse(rawId);
  if (!parsed.success) {
    res.status(404).json({ error: "Cliente não encontrado" });
    return null;
  }
  return parsed.data;
}

function respondToLifecycleError(error: unknown, res: Response): boolean {
  if (!(error instanceof CustomerLifecycleError)) return false;

  if (error.code === "SERVICE_ORDER_HISTORY_EXISTS") {
    res.status(409).json({
      error:
        "Este cliente possui histórico de ordens de serviço. Anonimize o cadastro para preservar o histórico.",
    });
    return true;
  }

  res.status(404).json({
    error:
      error.code === "ACCOUNT_NOT_FOUND"
        ? "Conta de acesso do cliente não encontrada"
        : "Cliente não encontrado",
  });
  return true;
}

export async function createCustomerController(req: Request, res: Response) {
  const result = createCustomerSchema.safeParse(req.body);

  if (!result.success) {
    res.status(400).json({
      error: "Dados inválidos",
      details: result.error.flatten(),
    });

    return;
  }

  try {
    const customer = await createCustomer(result.data);

    res.status(201).json(customer);
  } catch (error) {
    const known = mapPrismaError(error);

    if (known) {
      res.status(known.status).json(known.body);
      return;
    }

    console.error(error);

    res.status(500).json({
      error: "Erro ao criar cliente",
    });
  }
}

export async function listCustomersController(req: AuthenticatedRequest, res: Response) {
  try {
    const search =
      typeof req.query.search === "string" && req.query.search.trim().length > 0
        ? req.query.search.trim()
        : undefined;

    const customers = req.userRole === "TECHNICIAN" && req.userId
      ? await listCustomersForTechnician(req.userId, { search })
      : await listCustomers({ search });

    res.json(customers);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Erro ao buscar clientes",
    });
  }
}

export async function getCustomerByIdController(
  req: AuthenticatedRequest & Request<{ id: string }>,
  res: Response
) {
  try {
    if (req.userRole === "TECHNICIAN") {
      const customer = req.userId
        ? await getCustomerByIdForTechnician(req.params.id, req.userId)
        : null;
      if (!customer) { res.status(404).json({ error: "Cliente não encontrado" }); return; }
      res.json(customer);
      return;
    }
    const customer = await getCustomerById(req.params.id);

    if (!customer) {
      res.status(404).json({
        error: "Cliente não encontrado"
      });

      return;
    }

    res.json(customer);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Erro ao buscar cliente"
    });
  }
}

export async function updateCustomerController(
  req: AuthenticatedRequest & Request<{ id: string }>,
  res: Response
) {
  const result = updateCustomerSchema.safeParse(req.body);

  if (!result.success) {
    res.status(400).json({
      error: "Dados inválidos",
      details: result.error.flatten()
    });

    return;
  }

  try {
    const customer = await getCustomerById(req.params.id);

    if (!customer) {
      res.status(404).json({
        error: "Cliente não encontrado"
      });

      return;
    }

    const updatedCustomer = await updateCustomer(
      req.params.id,
      result.data
    );

    res.json(updatedCustomer);
  } catch (error) {
    const known = mapPrismaError(error);

    if (known) {
      res.status(known.status).json(known.body);
      return;
    }

    console.error(error);

    res.status(500).json({
      error: "Erro ao atualizar cliente"
    });
  }
}

export async function deleteCustomerController(
  req: Request<{ id: string }>,
  res: Response
) {
  const customerId = validCustomerId(req.params.id, res);
  if (!customerId) return;

  try {
    await deleteCustomer(customerId);

    res.status(204).send();
  } catch (error) {
    if (respondToLifecycleError(error, res)) return;

    const known = mapPrismaError(error);
    if (known) {
      res.status(known.status).json(known.body);
      return;
    }

    console.error(error);

    res.status(500).json({
      error: "Erro ao excluir cliente"
    });
  }
}

export async function updateCustomerAccountStatusController(
  req: Request<{ id: string }>,
  res: Response,
) {
  const customerId = validCustomerId(req.params.id, res);
  if (!customerId) return;
  const result = customerAccountStatusSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Status de conta inválido" });
    return;
  }

  try {
    const customerAccount = await setCustomerAccountStatus(
      customerId,
      result.data.status,
    );
    console.info(
      result.data.status === "SUSPENDED"
        ? "customer account suspended"
        : "customer account reactivated",
      { customerId },
    );
    res.json({ customerAccount });
  } catch (error) {
    if (respondToLifecycleError(error, res)) return;
    console.error(error);
    res.status(500).json({ error: "Não foi possível alterar a conta do cliente" });
  }
}

export async function deleteCustomerAccountController(
  req: Request<{ id: string }>,
  res: Response,
) {
  const customerId = validCustomerId(req.params.id, res);
  if (!customerId) return;
  const body = emptyCustomerLifecycleSchema.safeParse(req.body ?? {});
  if (!body.success) {
    res.status(400).json({ error: "Dados inválidos" });
    return;
  }

  try {
    await deleteCustomerAccount(customerId);
    console.info("customer account deleted", { customerId });
    res.status(204).send();
  } catch (error) {
    if (respondToLifecycleError(error, res)) return;
    console.error(error);
    res.status(500).json({ error: "Não foi possível excluir a conta de acesso" });
  }
}

export async function anonymizeCustomerController(
  req: Request<{ id: string }>,
  res: Response,
) {
  const customerId = validCustomerId(req.params.id, res);
  if (!customerId) return;
  const body = emptyCustomerLifecycleSchema.safeParse(req.body ?? {});
  if (!body.success) {
    res.status(400).json({ error: "Dados inválidos" });
    return;
  }

  try {
    const customer = await anonymizeCustomer(customerId);
    console.info("customer anonymized", { customerId });
    res.json(customer);
  } catch (error) {
    if (respondToLifecycleError(error, res)) return;
    console.error(error);
    res.status(500).json({ error: "Não foi possível anonimizar o cliente" });
  }
}
