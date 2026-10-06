import { Router } from "express";

import {
  createCustomerController,
  listCustomersController,
  getCustomerByIdController,
  updateCustomerController,
  deleteCustomerController,
  updateCustomerAccountStatusController,
  deleteCustomerAccountController,
  anonymizeCustomerController,
} from "../controllers/customer.controller.js";

import { authMiddleware } from "../middlewares/auth.middleware.js";
import { requirePermission } from "../middlewares/permission.middleware.js";
import { writeRateLimiter } from "../middlewares/rate-limit.middleware.js";

const router = Router();

router.post(
  "/",
  authMiddleware,
  writeRateLimiter,
  requirePermission("CUSTOMER_CREATE"),
  createCustomerController
);

router.get(
  "/",
  authMiddleware,
  requirePermission("CUSTOMER_READ"),
  listCustomersController
);

router.get(
  "/:id",
  authMiddleware,
  requirePermission("CUSTOMER_READ"),
  getCustomerByIdController
);

router.patch(
  "/:id",
  authMiddleware,
  writeRateLimiter,
  requirePermission("CUSTOMER_UPDATE"),
  updateCustomerController
);

router.patch(
  "/:id/account/status",
  authMiddleware,
  writeRateLimiter,
  requirePermission("CUSTOMER_ACCOUNT_MANAGE"),
  updateCustomerAccountStatusController,
);

router.delete(
  "/:id/account",
  authMiddleware,
  writeRateLimiter,
  requirePermission("CUSTOMER_ACCOUNT_MANAGE"),
  deleteCustomerAccountController,
);

router.post(
  "/:id/anonymize",
  authMiddleware,
  writeRateLimiter,
  requirePermission("CUSTOMER_ANONYMIZE"),
  anonymizeCustomerController,
);

router.delete(
  "/:id",
  authMiddleware,
  writeRateLimiter,
  requirePermission("CUSTOMER_DELETE"),
  deleteCustomerController
);

export default router;
