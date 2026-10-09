import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";

import userRoutes from "./routes/user.routes.js";
import authRoutes from "./routes/auth.routes.js";
import customerRoutes from "./routes/customer.routes.js";
import serviceOrderRoutes from "./routes/service-order.routes.js";
import healthRoutes from "./routes/health.routes.js";

import { apiRateLimiter } from "./middlewares/rate-limit.middleware.js";
import { csrfProtectionForSession } from "./middlewares/csrf.middleware.js";
import {
  trustedProxyMiddleware,
  validateTrustedProxyConfiguration,
} from "./middlewares/trusted-proxy.middleware.js";

const app = express();
app.set("trust proxy", false);

const isProduction = process.env.NODE_ENV === "production";
const corsOrigin = process.env.CORS_ORIGIN;

if (!corsOrigin && isProduction) {
  throw new Error("CORS_ORIGIN precisa estar configurado em produção");
}

validateTrustedProxyConfiguration();

app.use(helmet({ referrerPolicy: { policy: "no-referrer" } }));

// localhost:5173 (the Vite dev server) is only ever a valid CORS origin in
// development. In production, the browser talks to the Vercel origin and
// the server-side proxy preserves that Origin when it calls this backend.
// Direct access to the Render URL is still public at the network layer, so
// production must allow only CORS_ORIGIN — never an unconditional dev URL.
const allowedOrigins = [
  corsOrigin,
  ...(isProduction ? [] : ["http://localhost:5173"]),
].filter((origin): origin is string => Boolean(origin));

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Origin não permitido pelo CORS"));
    },
    credentials: true,
    // Let signed API preflights reach trustedProxyMiddleware. /health remains
    // outside that boundary while retaining its existing CORS behavior.
    preflightContinue: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "x-csrf-token"],
  }),
);

app.use(express.json());
app.use(cookieParser());

app.use("/health", healthRoutes);

app.use(trustedProxyMiddleware);
app.use(apiRateLimiter);

// Public authentication flows do not require an existing CSRF token. They
// receive JSON only, are rate-limited, and CORS does not allow an arbitrary
// origin to send the required JSON request. Session-mutating endpoints within
// this router (/refresh and /logout) apply csrfProtectionForSession directly.
app.use("/auth", authRoutes);

// Protect every mutable request under the authenticated resource mounts in
// one place. Requests without access/refresh cookies pass through so their
// route-level auth middleware still returns the expected 401; any request
// carrying a session cookie must provide the double-submit CSRF pair.
app.use("/users", csrfProtectionForSession, userRoutes);
app.use("/customers", csrfProtectionForSession, customerRoutes);
app.use("/service-orders", csrfProtectionForSession, serviceOrderRoutes);

// Never delegate errors to Express' development handler, which can render a
// stack trace. CORS rejections receive a deliberate 403; all other failures
// keep internal details server-side.
const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof Error && error.message === "Origin não permitido pelo CORS") {
    res.status(403).json({ error: "Origem não permitida" });
    return;
  }

  console.error(error);
  res.status(500).json({ error: "Ocorreu um erro interno" });
};

app.use(errorHandler);

export default app;
