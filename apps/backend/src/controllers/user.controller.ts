import type { Request, Response } from "express";

import {
  createUser,
  listUsers
} from "../services/user.service.js";

import { createUserSchema } from "../schemas/user.schema.js";
import { mapPrismaError } from "../lib/prisma-errors.js";

export async function createUserController(
  req: Request,
  res: Response
) {
  const result = createUserSchema.safeParse(req.body);

  if (!result.success) {
    res.status(400).json({
      error: "Dados inválidos",
      details: result.error.flatten()
    });

    return;
  }

  try {
    const user = await createUser(result.data);

    res.status(201).json(user);
  } catch (error) {
    const known = mapPrismaError(error);

    if (known) {
      res.status(known.status).json(known.body);
      return;
    }

    console.error(error);

    res.status(500).json({
      error: "Erro ao criar usuário"
    });
  }
}

export async function listUsersController(
  _req: Request,
  res: Response
) {
  try {
    const users = await listUsers();

    res.json(users);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Erro ao buscar usuários"
    });
  }
}