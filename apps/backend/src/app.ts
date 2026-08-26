import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";

import userRoutes from "./routes/user.routes.js";
import authRoutes from "./routes/auth.routes.js";
import customerRoutes from "./routes/customer.routes.js";
import serviceOrderRoutes from "./routes/service-order.routes.js";
import healthRoutes from "./routes/health.routes.js";

import { apiRateLimiter } from "./middlewares/rate-limit.middleware.js";

const app = express();

const corsOrigin = process.env.CORS_ORIGIN;

if (!corsOrigin && process.env.NODE_ENV === "production") {
  throw new Error("CORS_ORIGIN precisa estar configurado em produção");
}

app.use(helmet());

app.use(
  cors({
    origin: corsOrigin ?? "http://localhost:5173",
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "x-csrf-token"],
  }),
);

app.use(express.json());
app.use(cookieParser());

app.use("/health", healthRoutes);

app.use(apiRateLimiter);

// /auth is intentionally NOT behind csrfProtection:
//  - /auth/register and /auth/login happen before any CSRF cookie exists,
//    so there's nothing to double-submit yet (both are rate limited, and
//    SameSite=Lax already blocks the cross-site form submissions that
//    matter here).
//  - /auth/refresh and /auth/logout only ever act on the caller's own
//    session (rotate or end it) — a forged cross-site call can't exfiltrate
//    anything, at worst it logs the legitimate user out, and both are rate
//    limited.
app.use("/auth", authRoutes);

// csrfProtection is applied per-route within each resource router below
// (authMiddleware, then csrfProtection, then requirePermission), NOT
// globally here. CSRF only makes sense to check once we know there's an
// authenticated session to protect — checking it globally, before auth,
// meant a fully unauthenticated mutating request (no cookies at all) hit
// the CSRF check first and got 403, never reaching the auth check that
// should have returned 401.
app.use("/users", userRoutes);
app.use("/customers", customerRoutes);
app.use("/service-orders", serviceOrderRoutes);

export default app;
