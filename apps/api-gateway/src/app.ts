import express, { type Application } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { env } from "@config";
import {
  requestIdMiddleware,
  requestLoggerMiddleware,
  errorHandler,
  notFoundHandler,
} from "@irctc/middleware";
import { successResponse, statusCode } from "@irctc/http";
import routes from "@routes";
import { mountRoutes } from "@routing";

const app: Application = express();

if (env.TRUST_PROXY === "true") {
  // Trust the first hop (the immediate load balancer/proxy)
  app.set("trust proxy", 1);
}

/**
 * Security headers
 */
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
      },
    },
  }),
);

/**
 * CORS (edge concern — only runs here, never on upstreams)
 */
app.use(
  cors({
    origin: env.CORS_ORIGINS,
    credentials: true,
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Request-ID",
      "traceparent",
      "baggage",
    ],
    exposedHeaders: [
      "X-Request-ID",
      "X-RateLimit-Limit",
      "X-RateLimit-Remaining",
      "Retry-After",
    ],
  }),
);

/**
 * Cookie parser (needed to read JWT from cookies)
 */
app.use(cookieParser());

/**
 * Request ID + structured logging
 */
app.use(requestIdMiddleware);
app.use(requestLoggerMiddleware);

/**
 * Health probes (before routes so k8s always sees them)
 * - /health/live
 * - /health/ready
 */
app.use("/", routes);

/**
 * Root endpoint
 */
app.get("/", (_req, res) => {
  res.status(statusCode.success).json(
    successResponse("Welcome to API Gateway", {
      version: "1.0.0",
      endpoints: {
        docs: "/docs",
        openapi: "/openapi.json",
        health: "/health",
        auth: "/api/v1/auth",
        users: "/api/v1/users",
      },
    }),
  );
});

/**
 * Per-prefix proxy chains (auth → rate limit → proxy)
 */
mountRoutes(app);

/**
 * 404 + central error handler (always last)
 */
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
