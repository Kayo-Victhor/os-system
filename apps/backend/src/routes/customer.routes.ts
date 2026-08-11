import { Router } from "express";

import {
  createCustomerController,
  listCustomersController
} from "../controllers/customer.controller.js";

import { authMiddleware } from "../middlewares/auth.middleware.js";

const router = Router();

router.post(
  "/",
  authMiddleware,
  createCustomerController
);

router.get(
  "/",
  authMiddleware,
  listCustomersController
);

export default router;