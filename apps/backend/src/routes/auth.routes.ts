import { Router } from "express";

import {
  loginController,
  refreshController,
  logoutController,
  meController,
  registerController,
  resendVerificationController,
  verifyEmailController,
  forgotPasswordController,
  resetPasswordController,
} from "../controllers/auth.controller.js";

import { authMiddleware } from "../middlewares/auth.middleware.js";
import { authRateLimiter, passwordResetRateLimiter } from "../middlewares/rate-limit.middleware.js";
import { csrfProtectionForSession } from "../middlewares/csrf.middleware.js";

const router = Router();

router.post("/register", authRateLimiter, registerController);
router.post("/login", authRateLimiter, loginController);
router.post("/verify-email", authRateLimiter, verifyEmailController);
router.post("/resend-verification", authRateLimiter, resendVerificationController);
router.post("/forgot-password", passwordResetRateLimiter, forgotPasswordController);
router.post("/reset-password", passwordResetRateLimiter, resetPasswordController);
router.post("/refresh", authRateLimiter, csrfProtectionForSession, refreshController);
router.post("/logout", authRateLimiter, csrfProtectionForSession, logoutController);
router.get("/me", authMiddleware, meController);

export default router;
