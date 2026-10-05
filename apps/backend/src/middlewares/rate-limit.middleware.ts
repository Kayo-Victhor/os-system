import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { Request } from "express";
import { createHash } from "node:crypto";
import { normalizeEmail } from "../lib/email.js";

function customerRegistrationKey(prefix: string) {
  return (req: Request) => {
    const rawEmail = typeof req.body?.email === "string" ? req.body.email : "invalid-email";
    const emailDigest = createHash("sha256").update(normalizeEmail(rawEmail)).digest("hex");
    return `${prefix}:${ipKeyGenerator(req.ip ?? "")}:${emailDigest}`;
  };
}

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test",
  message: {
    error: "Muitas tentativas. Tente novamente mais tarde.",
  },
});

export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test",
  message: {
    error: "Muitas requisições. Tente novamente em instantes.",
  },
});

export const writeRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 40,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test",
  message: {
    error: "Muitas requisições. Tente novamente em instantes.",
  },
});
export const passwordResetRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test",
  message: { error: "Muitas tentativas. Tente novamente mais tarde." },
});

export const customerRegistrationRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  keyGenerator: customerRegistrationKey("customer-register"),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test",
  message: { error: "Muitas tentativas. Tente novamente mais tarde." },
});

export const customerRegistrationResendRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 3,
  keyGenerator: customerRegistrationKey("customer-register-resend"),
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === "test",
  message: { error: "Muitas tentativas. Tente novamente mais tarde." },
});
