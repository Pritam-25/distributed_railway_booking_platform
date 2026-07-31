/**
 * ## module/createApp
 *
 * Express app factory that wires the canonical middleware stack:
 * helmet, body parsers, cookie parser, request id, request logger, health
 * router, versioned routes, not-found handler, error handler.
 *
 * Services compose by passing their versioned router and (optional) health
 * router and CORS origins. The framework does not own the root banner or
 * any service-specific routes.
 *
 * @packageDocumentation
 */

import express, {
  type Application,
  type ErrorRequestHandler,
  type RequestHandler,
  type Router,
} from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";

/**
 * Middleware bundles consumed by `createApp`. The framework stays
 * framework-agnostic about the implementation — services import the
 * `requestIdMiddleware` etc. from `@irctc/middleware` and pass them in.
 * This avoids a circular dependency between `@irctc/http` and
 * `@irctc/middleware` (the latter imports from `@irctc/http` for the
 * `AsyncLocalStorage` request context and response envelope).
 */
export interface CreateAppMiddleware {
  /** Sets `req.requestId`, runs downstream inside `runWithRequestContext`. */
  requestId: RequestHandler;
  /** Logs every request with timing, status, requestId, traceId. */
  requestLogger: RequestHandler;
  /** Last-resort handler for unmatched routes. */
  notFoundHandler: RequestHandler;
  /** Final error handler — must be the last `app.use(...)`. */
  errorHandler: ErrorRequestHandler;
}

/**
 * Options for `createApp`.
 */
export interface CreateAppOptions {
  /** Service name. Used for log enrichment only. */
  serviceName: string;
  /** Versioned API router — mounted at `/`. */
  router: Router;
  /** Middleware bundles from `@irctc/middleware`. */
  middleware: CreateAppMiddleware;
  /** Health router — mounted at `/health`. Omit if the service does not expose HTTP. */
  healthRouter?: Router;
  /** CORS origins. Omit to skip CORS entirely (services behind a gateway). */
  corsOrigins?: string[];
  /** Allowed request headers. Defaults to the platform header set. */
  corsAllowedHeaders?: string[];
  /** Exposed response headers. Defaults to the platform header set. */
  corsExposedHeaders?: string[];
  /** Trust the first hop (load balancer). Default false. */
  trustProxy?: boolean;
  /** Maximum JSON body size. Default `"1mb"`. */
  bodyLimit?: string;
}

const DEFAULT_CORS_ALLOWED_HEADERS = [
  "Content-Type",
  "Authorization",
  "X-Request-ID",
  "traceparent",
  "baggage",
];

const DEFAULT_CORS_EXPOSED_HEADERS = [
  "X-Request-ID",
  "X-RateLimit-Limit",
  "X-RateLimit-Remaining",
  "Retry-After",
];

/**
 * Builds the Express app with the canonical middleware stack.
 *
 * ### Middleware order
 *
 * 1. `trust proxy` (if `trustProxy`)
 * 2. `helmet` with strict CSP
 * 3. `cors` (if `corsOrigins`)
 * 4. `express.json` (if `bodyLimit`)
 * 5. `express.urlencoded`
 * 6. `cookieParser`
 * 7. `requestId` (from `middleware`)
 * 8. `requestLogger` (from `middleware`)
 * 9. `/health` (if `healthRouter`)
 * 10. `/` (the supplied `router`)
 * 11. `notFoundHandler`
 * 12. `errorHandler`
 *
 * ### Forbidden
 *
 * Service code, controllers, business logic. The framework must remain
 * unaware of the domain. Services can append a root banner (`app.get("/")`)
 * after `createApp`.
 *
 * @param options - App composition options.
 * @returns Configured Express `Application`.
 */
export const createApp = (options: CreateAppOptions): Application => {
  const {
    serviceName,
    router,
    middleware,
    healthRouter,
    corsOrigins,
    corsAllowedHeaders = DEFAULT_CORS_ALLOWED_HEADERS,
    corsExposedHeaders = DEFAULT_CORS_EXPOSED_HEADERS,
    trustProxy = false,
    bodyLimit = "1mb",
  } = options;

  const app: Application = express();

  if (trustProxy) {
    // Trust the first hop (the immediate load balancer/proxy).
    app.set("trust proxy", 1);
  }

  // Security headers — defense-in-depth if the service is ever accessed directly.
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

  if (corsOrigins) {
    app.use(
      cors({
        origin: corsOrigins,
        credentials: true,
        allowedHeaders: corsAllowedHeaders,
        exposedHeaders: corsExposedHeaders,
      }),
    );
  }

  app.use(express.json({ limit: bodyLimit }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  app.use(middleware.requestId);
  app.use(middleware.requestLogger);

  if (healthRouter) {
    // Health probes BEFORE routes so k8s always sees them.
    app.use("/health", healthRouter);
  }

  app.use("/", router);

  app.use(middleware.notFoundHandler);
  app.use(middleware.errorHandler);

  // `serviceName` is intentionally used only here for log enrichment on
  // duplicate-route warnings. The Express app itself does not need to
  // expose it; consumers can read it from `SERVICE_NAME` env.
  app.set("x-service-name", serviceName);

  return app;
};
