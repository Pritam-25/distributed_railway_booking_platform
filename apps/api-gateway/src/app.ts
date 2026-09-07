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
  configure(app) {
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
            admin: "/api/v1/admin",
            bookings: "/api/v1/bookings",
            schedules: "/api/v1/schedules",
            search: "/api/v1/search",
            payments: "/api/v1/payments",
          },
        }),
      );
    });

    /**
     * Per-prefix proxy chains (auth → rate limit → proxy).
     */
    mountRoutes(app);
  },
});

export default app;
