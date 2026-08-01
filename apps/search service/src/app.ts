/**
 * ## module/app
 *
 * `search-service` Express application. The framework boilerplate
 * (helmet, body parsers, cookie parser, request id, request logger,
 * `/health`, not-found handler, error handler) is wired by `createApp`
 * from `@irctc/http`. Middleware is injected to avoid a cycle with
 * `@irctc/middleware`.
 *
 * The versioned router is mounted under `/api/v1` (the framework
 * default mounts the root router at `/`, so we re-mount the router
 * explicitly to honour the gateway-facing prefix).
 */
import type { Request, Response } from "express";
import { successResponse, statusCode, createApp } from "@irctc/http";
import {
  requestIdMiddleware,
  requestLoggerMiddleware,
  errorHandler,
  notFoundHandler,
} from "@irctc/middleware";
import router, { healthRoutes } from "@routes";

/**
 * Creates and configures the Express application.
 */
const app = createApp({
  serviceName: "search-service",
  router,
  healthRouter: healthRoutes,
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
    successResponse("Welcome to Search Service API", {
      version: "1.0.0",
      endpoints: {
        health: "/health",
        search: "/api/v1/search",
      },
    }),
  );
});

export default app;
