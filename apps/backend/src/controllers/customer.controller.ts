import type { Request, Response } from "express";

import {
  createCustomer,
  listCustomers,
  getCustomerById,
  updateCustomer,
  deleteCustomer,
} from "../services/customer.service.js";

import {
  createCustomerSchema,
  updateCustomerSchema,
} from "../schemas/customer.schema.js";

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
    console.error(error);

    res.status(500).json({
      error: "Erro ao criar cliente",
    });
  }
}

export async function listCustomersController(_req: Request, res: Response) {
  try {
    const customers = await listCustomers();

    res.json(customers);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Erro ao buscar clientes",
    });
  }
}

export async function getCustomerByIdController(
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

    res.json(customer);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Erro ao buscar cliente"
    });
  }
}

export async function updateCustomerController(
  req: Request<{ id: string }>,
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
