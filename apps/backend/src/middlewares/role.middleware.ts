import type { NextFunction, Response } from "express";

import type { AuthenticatedRequest } from "./auth.middleware.js";

import type { UserRole } from "../generated/prisma/client.js";

export function requireRole(...allowedRoles: UserRole[]) {
  return (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    if (!req.userId || !req.userRole) {
      res.status(401).json({
        error: "Não autenticado"
      });

      return;
    }

    if (!allowedRoles.includes(req.userRole)) {
      res.status(403).json({
        error: "Você não tem permissão para acessar este recurso"
      });

      return;
    }

    next();
  };
}