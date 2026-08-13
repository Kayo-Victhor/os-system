import type { NextFunction, Request, Response } from "express";
import type { UserRole } from "../generated/prisma/client.js";
import { verifyAccessToken } from "../lib/tokens.js";
import { ACCESS_TOKEN_COOKIE } from "../lib/cookies.js";

export interface AuthenticatedRequest extends Request {
  userId?: string;
  userRole?: UserRole;
}

export function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  const token = req.cookies?.[ACCESS_TOKEN_COOKIE] as string | undefined;

  if (!token) {
    res.status(401).json({
      error: "Não autenticado",
    });

    return;
  }

  try {
    const payload = verifyAccessToken(token);

    req.userId = payload.sub;
    req.userRole = payload.role;

    next();
  } catch {
    res.status(401).json({
      error: "Sessão inválida ou expirada",
    });
  }
}
