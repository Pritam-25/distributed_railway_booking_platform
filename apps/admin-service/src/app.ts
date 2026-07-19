import express from "express";
import type { Request, Response, Application } from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import {
  requestIdMiddleware,
  requestLoggerMiddleware,
  errorHandler,
  notFoundHandler,
} from "@irctc/middleware";
import { successResponse, statusCode } from "@irctc/http";
import router, { healthRoutes } from "@routes";

const app: Application = express();

/**
 * Security headers (Defense-in-depth: protects service if accessed directly)
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
 * Request body parsers
 */
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

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
 */
app.use("/health", healthRoutes);

/**
 * Root endpoint
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

/**
 * API routes
 */
app.use("/", router);

/**
 * 404 + central error handler (always last)
 */
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
