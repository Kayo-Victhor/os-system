import { Router } from "express";

import {
  createUserController,
  listUsersController,
  getUserByIdController,
  updateUserController,
  deleteUserController,
} from "../controllers/user.controller.js";

import { authMiddleware } from "../middlewares/auth.middleware.js";
import { requirePermission } from "../middlewares/permission.middleware.js";
import { csrfProtection } from "../middlewares/csrf.middleware.js";
import { writeRateLimiter } from "../middlewares/rate-limit.middleware.js";

const router = Router();

router.post(
  "/",
  authMiddleware,
  writeRateLimiter,
  csrfProtection,
  requirePermission("USER_CREATE"),
  createUserController
);

router.get(
  "/",
  authMiddleware,
  requirePermission("USER_READ"),
  listUsersController
);

router.get(
  "/:id",
  authMiddleware,
  requirePermission("USER_READ"),
  getUserByIdController
);

router.patch(
  "/:id",
  authMiddleware,
  writeRateLimiter,
  csrfProtection,
  requirePermission("USER_UPDATE"),
  updateUserController
);

router.delete(
  "/:id",
  authMiddleware,
  writeRateLimiter,
  csrfProtection,
  requirePermission("USER_DELETE"),
  deleteUserController
);

export default router;
