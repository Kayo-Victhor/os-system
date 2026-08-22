import { Router } from "express";

import {
  loginController,
  refreshController,
  logoutController,
  meController,
  registerController,
} from "../controllers/auth.controller.js";

import { authMiddleware } from "../middlewares/auth.middleware.js";
import { authRateLimiter } from "../middlewares/rate-limit.middleware.js";

const router = Router();

router.post("/register", authRateLimiter, registerController);
router.post("/login", authRateLimiter, loginController);
router.post("/refresh", authRateLimiter, refreshController);
router.post("/logout", logoutController);
router.get("/me", authMiddleware, meController);

export default router;
