import { Router } from "express";

import { operationalReportController } from "../controllers/report.controller.js";
import { authMiddleware } from "../middlewares/auth.middleware.js";
import { requirePermission } from "../middlewares/permission.middleware.js";

const router = Router();

router.get(
  "/operations",
  authMiddleware,
  requirePermission("REPORT_READ"),
  operationalReportController,
);

export default router;
