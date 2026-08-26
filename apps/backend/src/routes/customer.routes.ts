import { Router } from "express";

import {
  createCustomerController,
  listCustomersController,
  getCustomerByIdController,
  updateCustomerController,
  deleteCustomerController
} from "../controllers/customer.controller.js";

import { authMiddleware } from "../middlewares/auth.middleware.js";
import { requirePermission } from "../middlewares/permission.middleware.js";
import { csrfProtection } from "../middlewares/csrf.middleware.js";

const router = Router();

router.post(
  "/",
  authMiddleware,
  csrfProtection,
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
  csrfProtection,
  requirePermission("CUSTOMER_UPDATE"),
  updateCustomerController
);

router.delete(
  "/:id",
  authMiddleware,
  csrfProtection,
  requirePermission("CUSTOMER_DELETE"),
  deleteCustomerController
);

export default router;
