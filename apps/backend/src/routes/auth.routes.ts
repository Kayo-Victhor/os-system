import { Router } from "express";

import {
  loginController,
  refreshController,
  logoutController,
  meController,
  confirmCustomerRegistrationController,
  forgotCustomerAccountPasswordController,
  registerController,
  resendCustomerRegistrationController,
  resendVerificationController,
  verifyEmailController,
  forgotPasswordController,
  resetPasswordController,
  resetCustomerAccountPasswordController,
} from "../controllers/auth.controller.js";

import { authMiddleware } from "../middlewares/auth.middleware.js";
import {
  authRateLimiter,
  customerRegistrationConfirmationRateLimiter,
  customerPasswordResetRateLimiter,
  customerRegistrationRateLimiter,
  customerRegistrationResendRateLimiter,
  passwordResetRateLimiter,
} from "../middlewares/rate-limit.middleware.js";
import { csrfProtectionForSession } from "../middlewares/csrf.middleware.js";

const router = Router();

// /register remains as a compatibility alias, but no longer creates a legacy
// User(CUSTOMER). Both paths persist only a pending registration.
router.post("/register", customerRegistrationRateLimiter, registerController);
router.post("/customer/register", customerRegistrationRateLimiter, registerController);
router.post(
  "/customer/register/resend",
  customerRegistrationResendRateLimiter,
  resendCustomerRegistrationController,
);
router.post(
  "/customer/register/confirm",
  customerRegistrationConfirmationRateLimiter,
  confirmCustomerRegistrationController,
);
router.post(
  "/customer/forgot-password",
  customerPasswordResetRateLimiter,
  forgotCustomerAccountPasswordController,
);
router.post(
  "/customer/reset-password",
  customerPasswordResetRateLimiter,
  resetCustomerAccountPasswordController,
);
router.post("/login", authRateLimiter, loginController);
router.post("/verify-email", authRateLimiter, verifyEmailController);
router.post("/resend-verification", authRateLimiter, resendVerificationController);
router.post("/forgot-password", passwordResetRateLimiter, forgotPasswordController);
router.post("/reset-password", passwordResetRateLimiter, resetPasswordController);
router.post("/refresh", authRateLimiter, csrfProtectionForSession, refreshController);
router.post("/logout", authRateLimiter, csrfProtectionForSession, logoutController);
router.get("/me", authMiddleware, meController);

export default router;
