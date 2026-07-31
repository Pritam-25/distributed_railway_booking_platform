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
 * ## middleware stack
 *
 * Mounted in the order defined by `.claude/rules/bootstrap.md`:
 *
 * 1. Helmet with a strict `Content-Security-Policy` (defense-in-depth).
 * 2. JSON + URL-encoded parsers, capped at `1mb`.
 * 3. Cookie parser (for future JWT-cookie auth).
 * 4. Request id and structured request logging before any handler.
 * 5. Health probes at `/health` ahead of `/api/v1` so k8s always sees them.
 * 6. 404 + central error handler last.
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

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(cookieParser());

app.use(requestIdMiddleware);
app.use(requestLoggerMiddleware);

app.use("/health", healthRoutes);

/**
 * ## root
 *
 * Landing endpoint that reports the service version and the available
 * route prefixes. Useful for `kubectl exec curl` smoke tests.
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

app.use("/api/v1", router);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
