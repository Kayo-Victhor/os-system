import type { Response } from "express";
import { z } from "zod";

import {
  CUSTOMER_ACCESS_TOKEN_COOKIE,
  CUSTOMER_CSRF_COOKIE,
  CUSTOMER_REFRESH_COOKIE_PATH,
  CUSTOMER_REFRESH_TOKEN_COOKIE,
  clearCookieOptions,
  customerAccessTokenCookieOptions,
  customerCsrfCookieOptions,
  customerRefreshTokenCookieOptions,
} from "../lib/cookies.js";
import { generateCsrfToken } from "../lib/tokens.js";
import type { CustomerAuthenticatedRequest } from "../middlewares/customer-auth.middleware.js";
import { customerLoginSchema } from "../schemas/auth.schema.js";
import {
  getCustomerAccountProfile,
  getCustomerServiceOrder,
  listCustomerServiceOrders,
  loginCustomerAccount,
  refreshCustomerSession,
  revokeCustomerSession,
  type CustomerSessionResult,
} from "../services/customer-auth.service.js";

function setCustomerSessionCookies(
  res: Response,
  session: CustomerSessionResult,
) {
  res.cookie(
    CUSTOMER_ACCESS_TOKEN_COOKIE,
    session.accessToken,
    customerAccessTokenCookieOptions(),
  );
  res.cookie(
    CUSTOMER_REFRESH_TOKEN_COOKIE,
    session.refreshToken,
    customerRefreshTokenCookieOptions(),
  );
  res.cookie(
    CUSTOMER_CSRF_COOKIE,
    generateCsrfToken(),
    customerCsrfCookieOptions(),
  );
}

function clearCustomerSessionCookies(res: Response) {
  res.clearCookie(CUSTOMER_ACCESS_TOKEN_COOKIE, clearCookieOptions("/"));
  res.clearCookie(
    CUSTOMER_REFRESH_TOKEN_COOKIE,
    clearCookieOptions(CUSTOMER_REFRESH_COOKIE_PATH),
  );
  res.clearCookie(CUSTOMER_CSRF_COOKIE, clearCookieOptions("/"));
}

export async function customerLoginController(
  req: CustomerAuthenticatedRequest,
  res: Response,
) {
  const result = customerLoginSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "Dados inválidos", details: result.error.flatten() });
    return;
  }

  try {
    const session = await loginCustomerAccount(result.data);
    if (!session) {
      res.status(401).json({ error: "E-mail ou senha inválidos." });
      return;
    }

    setCustomerSessionCookies(res, session);
    res.json({ customerAccount: session.customerAccount });
  } catch (error) {
    console.error(
      "Falha ao autenticar conta de cliente",
      error instanceof Error ? error.name : "erro desconhecido",
    );
    res.status(500).json({ error: "Não foi possível entrar. Tente novamente." });
  }
}

export async function customerRefreshController(
  req: CustomerAuthenticatedRequest,
  res: Response,
) {
  const presentedToken = req.cookies?.[CUSTOMER_REFRESH_TOKEN_COOKIE] as
    | string
    | undefined;
  if (!presentedToken) {
    res.status(401).json({ error: "Sessão não encontrada" });
    return;
  }

  try {
    const session = await refreshCustomerSession(presentedToken);
    if (!session) {
      clearCustomerSessionCookies(res);
      res.status(401).json({ error: "Sessão inválida ou expirada" });
      return;
    }

    setCustomerSessionCookies(res, session);
    res.json({ customerAccount: session.customerAccount });
  } catch (error) {
    console.error(
      "Falha ao renovar sessão de cliente",
      error instanceof Error ? error.name : "erro desconhecido",
    );
    clearCustomerSessionCookies(res);
    res.status(500).json({ error: "Não foi possível renovar a sessão" });
  }
}

export async function customerLogoutController(
  req: CustomerAuthenticatedRequest,
  res: Response,
) {
  const presentedToken = req.cookies?.[CUSTOMER_REFRESH_TOKEN_COOKIE] as
    | string
    | undefined;
  const accessToken = req.cookies?.[CUSTOMER_ACCESS_TOKEN_COOKIE] as
    | string
    | undefined;
  try {
    await revokeCustomerSession({
      accessToken,
      refreshToken: presentedToken,
    });
  } catch (error) {
    console.error(
      "Falha ao revogar sessão de cliente",
      error instanceof Error ? error.name : "erro desconhecido",
    );
  }
  clearCustomerSessionCookies(res);
  res.status(204).send();
}

export async function customerMeController(
  req: CustomerAuthenticatedRequest,
  res: Response,
) {
  if (!req.customerAccountId) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }

  const customerAccount = await getCustomerAccountProfile(req.customerAccountId);
  res.json({ customerAccount });
}

export async function customerServiceOrdersController(
  req: CustomerAuthenticatedRequest,
  res: Response,
) {
  if (!req.customerId) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }
  res.json(await listCustomerServiceOrders(req.customerId));
}

export async function customerServiceOrderController(
  req: CustomerAuthenticatedRequest,
  res: Response,
) {
  if (!req.customerId) {
    res.status(401).json({ error: "Não autenticado" });
    return;
  }
  const requestedId = Array.isArray(req.params.id)
    ? req.params.id[0]
    : req.params.id;
  const serviceOrderId = z.string().uuid().safeParse(requestedId);
  if (!serviceOrderId.success) {
    res.status(404).json({ error: "Ordem de serviço não encontrada" });
    return;
  }
  const serviceOrder = await getCustomerServiceOrder(
    req.customerId,
    serviceOrderId.data,
  );
  if (!serviceOrder) {
    res.status(404).json({ error: "Ordem de serviço não encontrada" });
    return;
  }
  res.json(serviceOrder);
}
