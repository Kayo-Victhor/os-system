import type { NextFunction, Request, Response } from "express";

import { CUSTOMER_ACCESS_TOKEN_COOKIE } from "../lib/cookies.js";
import { prisma } from "../lib/prisma.js";
import { verifyCustomerAccessToken } from "../lib/tokens.js";

export interface CustomerAuthenticatedRequest extends Request {
  customerAccountId?: string;
  customerSessionId?: string;
  principalType?: "CUSTOMER_ACCOUNT";
}

export async function customerAuthMiddleware(
  req: CustomerAuthenticatedRequest,
  res: Response,
  next: NextFunction,
) {
  const token = req.cookies?.[CUSTOMER_ACCESS_TOKEN_COOKIE] as
    | string
    | undefined;
  if (!token) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }

  try {
    const payload = verifyCustomerAccessToken(token);
    const session = await prisma.customerSession.findFirst({
      where: {
        id: payload.sid,
        customerAccountId: payload.sub,
        revokedAt: null,
        expiresAt: { gt: new Date() },
        customerAccount: {
          status: "ACTIVE",
          emailVerifiedAt: { not: null },
        },
      },
      select: { id: true, customerAccountId: true },
    });

    if (!session) {
      res.status(401).json({ error: "Sessão inválida ou expirada" });
      return;
    }

    req.customerAccountId = session.customerAccountId;
    req.customerSessionId = session.id;
    req.principalType = "CUSTOMER_ACCOUNT";
    next();
  } catch {
    res.status(401).json({ error: "Sessão inválida ou expirada" });
  }
}
