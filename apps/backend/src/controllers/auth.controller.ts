import type { Response } from "express";

import { loginSchema } from "../schemas/auth.schema.js";
import { registerSchema } from "../schemas/user.schema.js";
import {
  loginUser,
  refreshSession,
  revokeRefreshToken,
  registerCustomer,
} from "../services/auth.service.js";
import { mapPrismaError } from "../lib/prisma-errors.js";
import type { AuthenticatedRequest } from "../middlewares/auth.middleware.js";
import { prisma } from "../lib/prisma.js";
import { generateCsrfToken } from "../lib/tokens.js";
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  CSRF_COOKIE,
  accessTokenCookieOptions,
  refreshTokenCookieOptions,
  csrfCookieOptions,
  clearCookieOptions,
} from "../lib/cookies.js";
import type { SessionResult } from "../services/auth.service.js";

function setSessionCookies(res: Response, session: SessionResult) {
  res.cookie(ACCESS_TOKEN_COOKIE, session.accessToken, accessTokenCookieOptions());
  res.cookie(REFRESH_TOKEN_COOKIE, session.refreshToken, refreshTokenCookieOptions());
  res.cookie(CSRF_COOKIE, generateCsrfToken(), csrfCookieOptions());
}

export async function registerController(
  req: AuthenticatedRequest,
  res: Response,
) {
  const result = registerSchema.safeParse(req.body);

  if (!result.success) {
    res.status(400).json({
      error: "Dados inválidos",
      details: result.error.flatten(),
    });

    return;
  }

  try {
    const user = await registerCustomer(result.data);

    res.status(201).json({ user });
  } catch (error) {
    const known = mapPrismaError(error);

    if (known) {
      res.status(known.status).json(known.body);
      return;
    }

    console.error(error);

    res.status(500).json({
      error: "Erro ao criar conta",
    });
  }
}

export async function loginController(
  req: AuthenticatedRequest,
  res: Response,
) {
  const result = loginSchema.safeParse(req.body);

  if (!result.success) {
    res.status(400).json({
      error: "Dados inválidos",
      details: result.error.flatten(),
    });

    return;
  }

  try {
    const session = await loginUser(result.data);

    if (!session) {
      // Generic message on purpose — never reveal whether the email exists.
      res.status(401).json({
        error: "Credenciais inválidas",
      });

      return;
    }

    setSessionCookies(res, session);

    res.json({ user: session.user });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Erro ao realizar login",
    });
  }
}

export async function refreshController(
  req: AuthenticatedRequest,
  res: Response,
) {
  const presentedToken = req.cookies?.[REFRESH_TOKEN_COOKIE] as
    | string
    | undefined;

  if (!presentedToken) {
    res.status(401).json({ error: "Sessão não encontrada" });
    return;
  }

  try {
    const session = await refreshSession(presentedToken);

    if (!session) {
      res.clearCookie(ACCESS_TOKEN_COOKIE, clearCookieOptions("/"));
      res.clearCookie(REFRESH_TOKEN_COOKIE, clearCookieOptions("/auth/refresh"));
      res.clearCookie(CSRF_COOKIE, clearCookieOptions("/"));

      res.status(401).json({ error: "Sessão inválida ou expirada" });
      return;
    }

    setSessionCookies(res, session);

    res.json({ user: session.user });
  } catch (error) {
    console.error(error);

    res.status(500).json({ error: "Erro ao renovar sessão" });
  }
}

export async function logoutController(
  req: AuthenticatedRequest,
  res: Response,
) {
  const presentedToken = req.cookies?.[REFRESH_TOKEN_COOKIE] as
    | string
    | undefined;

  try {
    if (presentedToken) {
      await revokeRefreshToken(presentedToken);
    }
  } catch (error) {
    console.error(error);
  }

  res.clearCookie(ACCESS_TOKEN_COOKIE, clearCookieOptions("/"));
  res.clearCookie(REFRESH_TOKEN_COOKIE, clearCookieOptions("/auth/refresh"));
  res.clearCookie(CSRF_COOKIE, clearCookieOptions("/"));

  res.status(204).send();
}

export async function meController(req: AuthenticatedRequest, res: Response) {
  if (!req.userId) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { id: true, name: true, email: true, role: true },
  });

  if (!user) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }

  res.json({ user });
}
