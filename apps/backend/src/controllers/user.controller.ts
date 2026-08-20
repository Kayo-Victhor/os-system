import type { Response } from "express";
import type { Request } from "express";

import {
  createUser,
  listUsers,
  getUserById,
  updateUser,
  deleteUser,
  countAdmins,
} from "../services/user.service.js";

import { createUserSchema, updateUserSchema } from "../schemas/user.schema.js";
import { mapPrismaError } from "../lib/prisma-errors.js";
import type { AuthenticatedRequest } from "../middlewares/auth.middleware.js";

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
  req: Request,
  res: Response
) {
  try {
    const role = req.query.role;
    const validRoles = ["ADMIN", "USER", "TECHNICIAN"] as const;
    const roleFilter = validRoles.includes(role as (typeof validRoles)[number])
      ? (role as (typeof validRoles)[number])
      : undefined;

    const users = await listUsers({ role: roleFilter });

    res.json(users);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Erro ao buscar usuários"
    });
  }
}

export async function getUserByIdController(
  req: Request<{ id: string }>,
  res: Response
) {
  try {
    const user = await getUserById(req.params.id);

    if (!user) {
      res.status(404).json({ error: "Usuário não encontrado" });
      return;
    }

    res.json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao buscar usuário" });
  }
}

export async function updateUserController(
  req: Request<{ id: string }>,
  res: Response
) {
  const result = updateUserSchema.safeParse(req.body);

  if (!result.success) {
    res.status(400).json({
      error: "Dados inválidos",
      details: result.error.flatten(),
    });

    return;
  }

  try {
    const existing = await getUserById(req.params.id);

    if (!existing) {
      res.status(404).json({ error: "Usuário não encontrado" });
      return;
    }

    // Prevent demoting/deleting the last ADMIN account, which would lock
    // every admin-only feature (including this one) with no way back in
    // short of direct database access.
    if (
      existing.role === "ADMIN" &&
      result.data.role &&
      result.data.role !== "ADMIN"
    ) {
      const remainingAdmins = await countAdmins(existing.id);

      if (remainingAdmins === 0) {
        res.status(409).json({
          error: "Não é possível remover o último administrador do sistema",
        });

        return;
      }
    }

    const user = await updateUser(req.params.id, result.data);

    res.json(user);
  } catch (error) {
    const known = mapPrismaError(error);

    if (known) {
      res.status(known.status).json(known.body);
      return;
    }

    console.error(error);
    res.status(500).json({ error: "Erro ao atualizar usuário" });
  }
}

export async function deleteUserController(
  req: AuthenticatedRequest & Request<{ id: string }>,
  res: Response
) {
  try {
    if (req.userId === req.params.id) {
      res.status(400).json({
        error: "Você não pode excluir sua própria conta",
      });

      return;
    }

    const existing = await getUserById(req.params.id);

    if (!existing) {
      res.status(404).json({ error: "Usuário não encontrado" });
      return;
    }

    if (existing.role === "ADMIN") {
      const remainingAdmins = await countAdmins(existing.id);

      if (remainingAdmins === 0) {
        res.status(409).json({
          error: "Não é possível excluir o último administrador do sistema",
        });

        return;
      }
    }

    await deleteUser(req.params.id);

    res.status(204).send();
  } catch (error) {
    const known = mapPrismaError(error);

    if (known) {
      res.status(known.status).json(known.body);
      return;
    }

    console.error(error);
    res.status(500).json({ error: "Erro ao excluir usuário" });
  }
}
