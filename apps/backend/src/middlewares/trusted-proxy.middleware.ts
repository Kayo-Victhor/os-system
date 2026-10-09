import type { NextFunction, Request, Response } from "express";
import {
  assertValidProxySecret,
  createProxySignature,
  normalizeIpAddress,
  PROXY_CLIENT_IP_HEADER,
  PROXY_SIGNATURE_HEADER,
  PROXY_SIGNATURE_MAX_AGE_MS,
  PROXY_TIMESTAMP_HEADER,
  safeSignatureMatch,
} from "../lib/proxy-signature.js";

const trustedClientIps = new WeakMap<Request, string>();

function directRequestsAreAllowed(): boolean {
  return process.env.NODE_ENV !== "production"
    && process.env.ALLOW_DIRECT_API_REQUESTS === "true";
}

function directClientIp(req: Request): string {
  return normalizeIpAddress(req.socket.remoteAddress) ?? "unknown";
}

export function validateTrustedProxyConfiguration(): void {
  if (directRequestsAreAllowed()) return;
  assertValidProxySecret(process.env.INTERNAL_PROXY_SECRET);
}

export function getTrustedClientIp(req: Request): string | undefined {
  return trustedClientIps.get(req);
}

export function trustedProxyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (directRequestsAreAllowed()) {
    // Local/test access deliberately uses only the TCP peer. Forwarding
    // headers are untrusted here and must never create a new limiter key.
    trustedClientIps.set(req, directClientIp(req));
    next();
    return;
  }

  const secret = process.env.INTERNAL_PROXY_SECRET;
  assertValidProxySecret(secret);

  const timestamp = req.get(PROXY_TIMESTAMP_HEADER);
  const presentedIp = req.get(PROXY_CLIENT_IP_HEADER);
  const receivedSignature = req.get(PROXY_SIGNATURE_HEADER);
  const clientIp = normalizeIpAddress(presentedIp);

  if (
    !timestamp
    || !/^\d{13}$/.test(timestamp)
    || !clientIp
    || !receivedSignature
  ) {
    res.status(403).json({ error: "Acesso não permitido" });
    return;
  }

  const timestampMs = Number(timestamp);
  if (
    !Number.isSafeInteger(timestampMs)
    || Math.abs(Date.now() - timestampMs) > PROXY_SIGNATURE_MAX_AGE_MS
  ) {
    res.status(403).json({ error: "Acesso não permitido" });
    return;
  }

  const expectedSignature = createProxySignature(secret, {
    timestamp,
    method: req.method,
    pathAndQuery: req.originalUrl,
    clientIp,
  });

  if (!safeSignatureMatch(receivedSignature, expectedSignature)) {
    res.status(403).json({ error: "Acesso não permitido" });
    return;
  }

  trustedClientIps.set(req, clientIp);
  next();
}
