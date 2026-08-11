import type { Request, Response } from "express";

import {
  createCustomer,
  listCustomers
} from "../services/customer.service.js";

import { createCustomerSchema } from "../schemas/customer.schema.js";

export async function createCustomerController(
  req: Request,
  res: Response
) {
  const result = createCustomerSchema.safeParse(req.body);

  if (!result.success) {
    res.status(400).json({
      error: "Dados inválidos",
      details: result.error.flatten()
    });

    return;
  }

  try {
    const customer = await createCustomer(result.data);

    res.status(201).json(customer);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Erro ao criar cliente"
    });
  }
}

export async function listCustomersController(
  _req: Request,
  res: Response
) {
  try {
    const customers = await listCustomers();

    res.json(customers);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Erro ao buscar clientes"
    });
  }
}