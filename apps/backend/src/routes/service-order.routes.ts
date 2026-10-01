import { Router } from "express";

import {
  createServiceOrderController,
  listServiceOrdersController,
  getServiceOrderByIdController,
  updateServiceOrderController,
  deleteServiceOrderController,
  assignTechnicianController,
  updateServiceOrderStatusController,
} from "../controllers/service-order.controller.js";

import { authMiddleware } from "../middlewares/auth.middleware.js";
import { requirePermission } from "../middlewares/permission.middleware.js";
import { writeRateLimiter } from "../middlewares/rate-limit.middleware.js";

const router = Router();

router.post(
  "/",
  authMiddleware,
  writeRateLimiter,
  requirePermission("OS_CREATE"),
  createServiceOrderController,
);

router.get(
  "/",
  authMiddleware,
  requirePermission("OS_READ"),
  listServiceOrdersController,
);

router.get(
  "/:id",
  authMiddleware,
  requirePermission("OS_READ"),
  getServiceOrderByIdController,
);

router.patch(
  "/:id",
  authMiddleware,
  writeRateLimiter,
  requirePermission("OS_UPDATE"),
  updateServiceOrderController,
);

router.delete(
  "/:id",
  authMiddleware,
  writeRateLimiter,
  requirePermission("OS_DELETE"),
  deleteServiceOrderController,
);

router.patch(
  "/:id/technician",
  authMiddleware,
  writeRateLimiter,
  requirePermission("OS_ASSIGN"),
  assignTechnicianController,
);

router.patch(
  "/:id/status",
  authMiddleware,
  writeRateLimiter,
  requirePermission("OS_UPDATE_STATUS"),
  updateServiceOrderStatusController,
);

export default router;
