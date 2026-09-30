import type { Request, Response } from "express";

import {
  createCustomer,
  listCustomers,
  listCustomersForTechnician,
  getCustomerById,
  getCustomerByIdForTechnician,
  getCustomerByUserId,
  updateCustomer,
  deleteCustomer,
} from "../services/customer.service.js";

import {
  createCustomerSchema,
  updateCustomerSchema,
} from "../schemas/customer.schema.js";

import { mapPrismaError } from "../lib/prisma-errors.js";
import type { AuthenticatedRequest } from "../middlewares/auth.middleware.js";

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
    if (req.userRole === "CUSTOMER") {
      const customer = req.userId ? await getCustomerByUserId(req.userId) : null;
      if (!customer) { res.status(404).json({ error: "Cadastro de cliente não encontrado" }); return; }
      res.json([customer]);
      return;
    }
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
    if (req.userRole === "CUSTOMER") {
      const own = req.userId ? await getCustomerByUserId(req.userId) : null;
      if (!own || own.id !== req.params.id) { res.status(404).json({ error: "Cliente não encontrado" }); return; }
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
    if (req.userRole === "CUSTOMER") {
      const own = req.userId ? await getCustomerByUserId(req.userId) : null;
      if (!own || own.id !== req.params.id) { res.status(404).json({ error: "Cliente não encontrado" }); return; }
    }
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
  try {
    const customer = await getCustomerById(req.params.id);

    if (!customer) {
      res.status(404).json({
        error: "Cliente não encontrado"
      });

      return;
    }

    await deleteCustomer(req.params.id);

    res.status(204).send();
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Erro ao excluir cliente"
    });
  }
}

export async function getOwnCustomerController(req: AuthenticatedRequest, res: Response) {
  if (!req.userId) { res.status(401).json({ error: "Não autenticado" }); return; }
  const customer = await getCustomerByUserId(req.userId);
  if (!customer) { res.status(404).json({ error: "Cadastro de cliente não encontrado" }); return; }
  res.json(customer);
}
