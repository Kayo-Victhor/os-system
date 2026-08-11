import { Router } from "express";

import {
  createUserController,
  listUsersController
} from "../controllers/user.controller.js";

import { authMiddleware } from "../middlewares/auth.middleware.js";
import { requireRole } from "../middlewares/role.middleware.js";

const router = Router();

router.post("/", createUserController);

router.get(
  "/",
  authMiddleware,
  requireRole("ADMIN"),
  listUsersController
);

export default router;