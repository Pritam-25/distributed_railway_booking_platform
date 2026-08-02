/**
 * ## module/app
 *
 * `admin-service` Express application. The framework boilerplate
 * (helmet, CORS, body parsers, cookie parser, request id, request
 * logger, `/health`, not-found handler, error handler) is wired by
 * `createApp` from `@irctc/http`. Middleware is injected to avoid a
 * cycle with `@irctc/middleware`.
 *
 * The root banner is appended here so the service-specific route
 * catalogue stays alongside the routes.
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
  serviceName: "admin-service",
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
        successResponse("Welcome to Admin Service API", {
          version: "1.0.0",
          endpoints: {
            health: "/health",
            auth: "/admin/auth",
            trains: "/admin/trains",
            coaches: "/admin/coaches",
            stations: "/admin/stations",
            routes: "/admin/routes",
            routeStations: "/admin/route-stations",
            schedules: "/admin/schedules",
          },
        }),
      );
    });
  },
});

export default app;
