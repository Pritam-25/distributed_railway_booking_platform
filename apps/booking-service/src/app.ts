/**
 * ## module/app
 *
 * Express app composition for `booking-service`. Delegates the canonical
 * middleware stack to `createApp` from `@irctc/http`. The framework owns
 * helmet, body parsers, cookie parser, request id, request logger, health
 * router, and error handler. The service owns the root banner and any
 * service-specific routes mounted after `createApp`.
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
  serviceName: "booking-service",
  router,
  healthRouter: healthRoutes,
  middleware: {
    requestId: requestIdMiddleware,
    requestLogger: requestLoggerMiddleware,
    notFoundHandler,
    errorHandler,
  },
  configure(app) {
    /**
     * Root endpoint — service banner.
     */
    app.get("/", (_req: Request, res: Response) => {
      res.status(statusCode.success).json(
        successResponse("Welcome to Booking Service API", {
          version: "1.0.0",
          endpoints: {
            health: "/health",
            bookings: "/bookings",
          },
        }),
      );
    });
  },
});

export default app;
