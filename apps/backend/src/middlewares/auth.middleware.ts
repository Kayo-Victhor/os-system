import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { UserRole } from "../generated/prisma/client.js";

const JWT_SECRET: string = process.env.JWT_SECRET ?? "";

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET não configurado");
}

export interface AuthenticatedRequest extends Request {
  userId?: string;
  userRole?: UserRole;
}

export function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  const authorization = req.headers.authorization;

  if (!authorization) {
    res.status(401).json({
      error: "Token não fornecido",
    });

    return;
  }

  const [scheme, token] = authorization.split(" ");

  if (scheme !== "Bearer" || !token) {
    res.status(401).json({
      error: "Formato do token inválido",
    });

    return;
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    if (typeof decoded === "string" || !decoded.sub) {
      res.status(401).json({
        error: "Token inválido",
      });

      return;
    }

    if (
      decoded.role !== "ADMIN" &&
      decoded.role !== "USER" &&
      decoded.role !== "TECHNICIAN"
    ) {
      res.status(401).json({
        error: "Role inválida",
      });

      return;
    }

    req.userId = decoded.sub;
    req.userRole = decoded.role;

    next();
  } catch {
    res.status(401).json({
      error: "Token inválido ou expirado",
    });
  }
}
