/**
 * ## module/app
 *
 * `api-gateway` Express application. The framework boilerplate (helmet,
 * CORS, cookie parser, request id, request logger, not-found handler,
 * error handler) is wired by `createApp` from `@irctc/http`. Middleware
 * is injected to avoid a cycle with `@irctc/middleware`.
 *
 * CORS is enabled because the gateway is the public edge; the framework
 * defaults are overridden to match the gateway's existing allowed /
 * exposed header set.
 *
 * Body parsers are registered by `createApp` but inert here — the
 * gateway is a pure proxy and never reads `req.body`.
 *
 * The root banner and per-prefix proxy chains (`mountRoutes`) are
 * appended after `createApp` so service-specific routing lives next to
 * the route configuration.
 */
import type { Request, Response } from "express";
import { successResponse, statusCode, createApp } from "@irctc/http";
import {
  requestIdMiddleware,
  requestLoggerMiddleware,
  errorHandler,
  notFoundHandler,
} from "@irctc/middleware";
import { env } from "@config";
import routes from "@routes";
import { mountRoutes } from "@routing";

/**
 * Creates and configures the Express application.
 */
/**
 * Creates and configures the Express application.
 */
const app = createApp({
  serviceName: "api-gateway",
  router: routes,
  corsOrigins: env.CORS_ORIGINS,
  trustProxy: env.TRUST_PROXY === "true",
  middleware: {
    requestId: requestIdMiddleware,
    requestLogger: requestLoggerMiddleware,
    notFoundHandler,
    errorHandler,
  },
});

/**
 * Root endpoint — service banner.
 */
app.get("/", (_req: Request, res: Response) => {
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
 * Per-prefix proxy chains (auth → rate limit → proxy).
 */
mountRoutes(app);

export default app;
