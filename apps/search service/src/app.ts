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
  configure(app) {
    /**
     * Root endpoint — service banner.
     */
    app.get("/", (_req: Request, res: Response) => {
      res.status(statusCode.success).json(
        successResponse("Welcome to Search Service API", {
          version: "1.0.0",
          endpoints: {
            health: "/health",
            search: "/search",
          },
        }),
      );
    });
  },
});

export default app;
