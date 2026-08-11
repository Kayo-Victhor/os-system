import { Router } from "express";

import {
  createUserController,
  listUsersController
} from "../controllers/user.controller.js";

import { authMiddleware } from "../middlewares/auth.middleware.js";
import { requirePermission } from "../middlewares/permission.middleware.js";

const router = Router();

router.post(
  "/",
  authMiddleware,
  requirePermission("USER_CREATE"),
  createUserController
);

router.get(
  "/",
  authMiddleware,
  requirePermission("USER_READ"),
  listUsersController
);

export default router;