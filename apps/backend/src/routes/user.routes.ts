import { Router } from "express";

import {
  createUser,
  listUsers
} from "../services/user.service.js";

const router = Router();

router.post("/", async (req, res) => {
  try {
    const user = await createUser(req.body);

    res.status(201).json(user);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Erro ao criar usuário"
    });
  }
});

router.get("/", async (_req, res) => {
  try {
    const users = await listUsers();

    res.json(users);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Erro ao buscar usuários"
    });
  }
});

export default router;