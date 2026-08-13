import rateLimit from "express-rate-limit";

// NOTE: this uses express-rate-limit's default in-memory store, which is
// per-process. That's fine for a single instance. If this API is ever run
// as multiple instances/containers behind a load balancer, swap in a
// shared store (e.g. rate-limit-redis) so limits are enforced globally
// instead of per-instance.

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: "Muitas tentativas. Tente novamente mais tarde.",
  },
});

export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: "Muitas requisições. Tente novamente em instantes.",
  },
});

export const writeRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 40,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: {
    error: "Muitas requisições. Tente novamente em instantes.",
  },
});
