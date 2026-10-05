import type { Response } from "express";

import { forgotPasswordSchema, loginSchema, resendVerificationSchema, resetPasswordSchema, verifyEmailSchema } from "../schemas/auth.schema.js";
import { registerSchema } from "../schemas/user.schema.js";
import {
  loginUser,
  refreshSession,
  revokeRefreshToken,
  registerCustomer,
  resendEmailVerification,
  verifyEmail,
  requestPasswordReset,
  resetPassword,
  requiresEmailVerification,
} from "../services/auth.service.js";
import { EmailDeliveryError } from "../services/email.service.js";
import { mapPrismaError } from "../lib/prisma-errors.js";
import type { AuthenticatedRequest } from "../middlewares/auth.middleware.js";
import { prisma } from "../lib/prisma.js";
import { generateCsrfToken } from "../lib/tokens.js";
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  CSRF_COOKIE,
  REFRESH_COOKIE_PATH,
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

function clearSessionCookies(res: Response) {
  res.clearCookie(ACCESS_TOKEN_COOKIE, clearCookieOptions("/"));
  res.clearCookie(REFRESH_TOKEN_COOKIE, clearCookieOptions(REFRESH_COOKIE_PATH));
  res.clearCookie(CSRF_COOKIE, clearCookieOptions("/"));
}

export async function registerController(req: AuthenticatedRequest, res: Response) {
  const result = registerSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Dados inválidos", details: result.error.flatten() });
    return;
  }

  try {
    const registration = await registerCustomer(result.data);
    res.status(201).json(registration);
  } catch (error) {
    if (error instanceof EmailDeliveryError) {
      // The account remains unverified and can safely use the generic resend endpoint.
      res.status(503).json({ error: "Não foi possível enviar o e-mail de confirmação. Tente reenviar em alguns minutos." });
      return;
    }
    const known = mapPrismaError(error);
    if (known) { res.status(known.status).json(known.body); return; }
    console.error(error);
    res.status(500).json({ error: "Erro ao criar conta" });
  }
}

export async function loginController(req: AuthenticatedRequest, res: Response) {
  const result = loginSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Dados inválidos", details: result.error.flatten() });
    return;
  }

  try {
    const session = await loginUser(result.data);
    if (!session) {
      res.status(401).json({ error: "Credenciais inválidas" });
      return;
    }
    if (session === "UNVERIFIED") {
      res.status(403).json({
        error: "Confirme seu endereço de e-mail antes de entrar.",
        code: "EMAIL_NOT_VERIFIED",
      });
      return;
    }

    setSessionCookies(res, session);
    res.json({ user: session.user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Erro ao realizar login" });
  }
}

export async function refreshController(req: AuthenticatedRequest, res: Response) {
  const presentedToken = req.cookies?.[REFRESH_TOKEN_COOKIE] as string | undefined;
  if (!presentedToken) { res.status(401).json({ error: "Sessão não encontrada" }); return; }

  try {
    const session = await refreshSession(presentedToken);
    if (!session) {
      clearSessionCookies(res);
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

export async function logoutController(req: AuthenticatedRequest, res: Response) {
  const presentedToken = req.cookies?.[REFRESH_TOKEN_COOKIE] as string | undefined;
  try { if (presentedToken) await revokeRefreshToken(presentedToken); } catch (error) { console.error(error); }
  clearSessionCookies(res);
  res.status(204).send();
}

export async function meController(req: AuthenticatedRequest, res: Response) {
  if (!req.userId) { res.status(401).json({ error: "Não autenticado" }); return; }
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { id: true, name: true, email: true, role: true, isPrimaryAdmin: true, emailVerifiedAt: true },
  });
  if (!user || (requiresEmailVerification(user.role) && !user.emailVerifiedAt)) {
    res.status(401).json({ error: "Sessão inválida ou expirada" });
    return;
  }
  res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role, isPrimaryAdmin: user.isPrimaryAdmin } });
}

export async function verifyEmailController(req: AuthenticatedRequest, res: Response) {
  const result = verifyEmailSchema.safeParse(req.body);
  if (!result.success) { res.status(400).json({ error: "Link de confirmação inválido ou expirado" }); return; }

  try {
    const verification = await verifyEmail(result.data.token);
    if (verification !== "VERIFIED") { res.status(400).json({ error: "Link de confirmação inválido ou expirado" }); return; }
    res.json({ message: "E-mail confirmado com sucesso. Você já pode entrar." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Não foi possível confirmar o e-mail" });
  }
}

export async function resendVerificationController(req: AuthenticatedRequest, res: Response) {
  const result = resendVerificationSchema.safeParse(req.body);
  if (!result.success) { res.status(400).json({ error: "Dados inválidos" }); return; }

  try {
    await resendEmailVerification(result.data.email);
    // Deliberately generic: the same response prevents account enumeration.
    res.status(202).json({ message: "Se houver uma conta pendente para este e-mail, enviaremos uma nova confirmação." });
  } catch (error) {
    if (error instanceof EmailDeliveryError) {
      res.status(503).json({ error: "Não foi possível enviar o e-mail de confirmação. Tente novamente em alguns minutos." });
      return;
    }
    console.error(error);
    res.status(500).json({ error: "Não foi possível processar o reenvio" });
  }
}


const PASSWORD_RESET_MESSAGE = "Se o e-mail estiver cadastrado, enviaremos instruções para redefinir sua senha.";

export async function forgotPasswordController(req: AuthenticatedRequest, res: Response) {
  const result = forgotPasswordSchema.safeParse(req.body);
  if (!result.success) { res.status(400).json({ error: "Informe um e-mail válido" }); return; }
  try { await requestPasswordReset(result.data.email); }
  catch (error) { console.error("Falha ao solicitar redefinição de senha", error instanceof Error ? error.name : "erro desconhecido"); }
  res.status(202).json({ message: PASSWORD_RESET_MESSAGE });
}

export async function resetPasswordController(req: AuthenticatedRequest, res: Response) {
  const result = resetPasswordSchema.safeParse(req.body);
  if (!result.success) { res.status(400).json({ error: "Dados inválidos", details: result.error.flatten() }); return; }
  try {
    const changed = await resetPassword(result.data.token, result.data.password);
    if (!changed) { res.status(400).json({ error: "Este link é inválido, expirou ou já foi utilizado." }); return; }
    clearSessionCookies(res);
    res.json({ message: "Senha redefinida com sucesso. Entre novamente para continuar." });
  } catch (error) {
    console.error("Falha ao redefinir senha", error instanceof Error ? error.name : "erro desconhecido");
    res.status(500).json({ error: "Não foi possível redefinir a senha" });
  }
}
