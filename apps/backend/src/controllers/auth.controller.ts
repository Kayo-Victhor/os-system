import type { Response } from "express";

import { confirmCustomerRegistrationSchema, forgotCustomerAccountPasswordSchema, forgotPasswordSchema, loginSchema, resendCustomerRegistrationSchema, resetCustomerAccountPasswordSchema, resetPasswordSchema } from "../schemas/auth.schema.js";
import { registerSchema } from "../schemas/user.schema.js";
import {
  loginUser,
  refreshSession,
  revokeRefreshToken,
  requestPasswordReset,
  resetPassword,
} from "../services/auth.service.js";
import {
  CUSTOMER_REGISTRATION_MESSAGE,
  confirmCustomerRegistration,
  requestCustomerRegistration,
  resendCustomerRegistration,
} from "../services/customer-registration.service.js";
import { EmailDeliveryError } from "../services/email.service.js";
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
import { mapPrismaError } from "../lib/prisma-errors.js";
import {
  requestCustomerAccountPasswordReset,
  resetCustomerAccountPassword,
} from "../services/customer-password-reset.service.js";

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
    await requestCustomerRegistration(result.data);
    res.status(202).json({ message: CUSTOMER_REGISTRATION_MESSAGE });
  } catch (error) {
    if (error instanceof EmailDeliveryError) {
      res.status(503).json({ error: "Não foi possível enviar o e-mail de confirmação. Tente reenviar em alguns minutos." });
      return;
    }
    console.error(error);
    res.status(500).json({ error: "Não foi possível processar o cadastro" });
  }
}

export async function resendCustomerRegistrationController(
  req: AuthenticatedRequest,
  res: Response,
) {
  const result = resendCustomerRegistrationSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Informe um e-mail válido" });
    return;
  }

  try {
    await resendCustomerRegistration(result.data.email);
    res.status(202).json({ message: CUSTOMER_REGISTRATION_MESSAGE });
  } catch (error) {
    if (error instanceof EmailDeliveryError) {
      res.status(503).json({ error: "Não foi possível enviar o e-mail de confirmação. Tente novamente em alguns minutos." });
      return;
    }
    console.error("Falha ao reenviar cadastro de cliente", error instanceof Error ? error.name : "erro desconhecido");
    res.status(500).json({ error: "Não foi possível processar o reenvio" });
  }
}

export async function confirmCustomerRegistrationController(
  req: AuthenticatedRequest,
  res: Response,
) {
  const result = confirmCustomerRegistrationSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Este link de confirmação é inválido ou expirou." });
    return;
  }

  try {
    const confirmation = await confirmCustomerRegistration(result.data.token);
    if (confirmation !== "CONFIRMED") {
      res.status(400).json({ error: "Este link de confirmação é inválido ou expirou." });
      return;
    }

    res.json({ message: "Cadastro confirmado com sucesso. Você já pode entrar." });
  } catch (error) {
    const known = mapPrismaError(error);
    if (known?.status === 409) {
      res.status(409).json({ error: "Não foi possível confirmar este cadastro." });
      return;
    }

    console.error(
      "Falha ao confirmar cadastro de cliente",
      error instanceof Error ? error.name : "erro desconhecido",
    );
    res.status(500).json({ error: "Não foi possível confirmar o cadastro." });
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
    select: { id: true, name: true, email: true, role: true, isPrimaryAdmin: true },
  });
  if (!user) {
    res.status(401).json({ error: "Sessão inválida ou expirada" });
    return;
  }
  res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role, isPrimaryAdmin: user.isPrimaryAdmin } });
}

const PASSWORD_RESET_MESSAGE = "Se o e-mail estiver cadastrado, enviaremos instruções para redefinir sua senha.";
const CUSTOMER_PASSWORD_RESET_MESSAGE =
  "Se a conta existir, enviaremos instruções para redefinição de senha.";

export async function forgotPasswordController(req: AuthenticatedRequest, res: Response) {
  const result = forgotPasswordSchema.safeParse(req.body);
  if (!result.success) { res.status(400).json({ error: "Informe um e-mail válido" }); return; }
  try { await requestPasswordReset(result.data.email); }
  catch (error) { console.error("Falha ao solicitar redefinição de senha", error instanceof Error ? error.name : "erro desconhecido"); }
  res.status(202).json({ message: PASSWORD_RESET_MESSAGE });
}

export async function forgotCustomerAccountPasswordController(
  req: AuthenticatedRequest,
  res: Response,
) {
  const result = forgotCustomerAccountPasswordSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Informe um e-mail válido" });
    return;
  }

  try {
    await requestCustomerAccountPasswordReset(result.data.email);
  } catch (error) {
    // The public response remains indistinguishable for absent, ineligible and
    // temporarily undeliverable accounts. Operational details stay server-side.
    console.error(
      "Falha ao solicitar redefinição de senha de cliente",
      error instanceof Error ? error.name : "erro desconhecido",
    );
  }

  res.status(202).json({ message: CUSTOMER_PASSWORD_RESET_MESSAGE });
}

export async function resetCustomerAccountPasswordController(
  req: AuthenticatedRequest,
  res: Response,
) {
  const result = resetCustomerAccountPasswordSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Dados inválidos", details: result.error.flatten() });
    return;
  }

  try {
    const changed = await resetCustomerAccountPassword(
      result.data.token,
      result.data.password,
    );
    if (!changed) {
      res.status(400).json({ error: "Este link é inválido, expirou ou já foi utilizado." });
      return;
    }

    res.json({ message: "Senha redefinida com sucesso. Entre novamente para continuar." });
  } catch (error) {
    console.error(
      "Falha ao redefinir senha de cliente",
      error instanceof Error ? error.name : "erro desconhecido",
    );
    res.status(500).json({ error: "Não foi possível redefinir a senha" });
  }
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
