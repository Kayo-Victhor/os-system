import type { NextFunction, Response } from "express";

import type { AuthenticatedRequest } from "./auth.middleware.js";

import {
  permissions,
  type Permission
} from "../config/permissions.js";

export function requirePermission(permission: Permission) {
  return (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    if (!req.userRole) {
      res.status(401).json({
        error: "Não autenticado"
      });

      return;
    }

    const rolePermissions = permissions[req.userRole];

    if (!(rolePermissions as readonly Permission[]).includes(permission)) {
      res.status(403).json({
        error: "Você não tem permissão para executar esta ação"
      });

      return;
    }

    next();
  };
}