import type { Request, Response } from "express";

import { loginSchema } from "../schemas/auth.schema.js";
import { loginUser } from "../services/auth.service.js";

export async function loginController(
  req: Request,
  res: Response
) {
  const result = loginSchema.safeParse(req.body);

  if (!result.success) {
    res.status(400).json({
      error: "Dados inválidos",
      details: result.error.flatten()
    });

    return;
  }

  try {
    const resultLogin = await loginUser(result.data);

    if (!resultLogin) {
      res.status(401).json({
        error: "E-mail ou senha inválidos"
      });

      return;
    }

    res.json(resultLogin);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Erro ao realizar login"
    });
  }
}