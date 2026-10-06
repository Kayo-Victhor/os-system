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
  forgotPasswordController,
  resetPasswordController,
  resetCustomerAccountPasswordController,
} from "../controllers/auth.controller.js";
import {
  customerLoginController,
  customerLogoutController,
  customerMeController,
  customerRefreshController,
  customerServiceOrderController,
  customerServiceOrdersController,
} from "../controllers/customer-auth.controller.js";

import { authMiddleware } from "../middlewares/auth.middleware.js";
import {
  authRateLimiter,
  customerAuthRateLimiter,
  customerRegistrationConfirmationRateLimiter,
  customerPasswordResetRateLimiter,
  customerRegistrationRateLimiter,
  customerRegistrationResendRateLimiter,
  passwordResetRateLimiter,
} from "../middlewares/rate-limit.middleware.js";
import {
  csrfProtectionForCustomerSession,
  csrfProtectionForSession,
} from "../middlewares/csrf.middleware.js";
import { customerAuthMiddleware } from "../middlewares/customer-auth.middleware.js";

const router = Router();

// /register remains as a compatibility alias. Both paths persist only a
// pending customer registration and never create an internal User.
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
  csrfProtectionForCustomerSession,
  forgotCustomerAccountPasswordController,
);
router.post(
  "/customer/reset-password",
  customerPasswordResetRateLimiter,
  csrfProtectionForCustomerSession,
  resetCustomerAccountPasswordController,
);
router.post(
  "/customer/login",
  customerAuthRateLimiter,
  csrfProtectionForCustomerSession,
  customerLoginController,
);
router.post(
  "/customer/refresh",
  customerAuthRateLimiter,
  csrfProtectionForCustomerSession,
  customerRefreshController,
);
router.post(
  "/customer/logout",
  customerAuthRateLimiter,
  csrfProtectionForCustomerSession,
  customerLogoutController,
);
router.get("/customer/me", customerAuthMiddleware, customerMeController);
router.get(
  "/customer/service-orders",
  customerAuthMiddleware,
  customerServiceOrdersController,
);
router.get(
  "/customer/service-orders/:id",
  customerAuthMiddleware,
  customerServiceOrderController,
);
router.post("/login", authRateLimiter, loginController);
router.post("/forgot-password", passwordResetRateLimiter, forgotPasswordController);
router.post("/reset-password", passwordResetRateLimiter, resetPasswordController);
router.post("/refresh", authRateLimiter, csrfProtectionForSession, refreshController);
router.post("/logout", authRateLimiter, csrfProtectionForSession, logoutController);
router.get("/me", authMiddleware, meController);

export default router;
