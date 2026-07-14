import type { Application, RequestHandler } from "express";
import { routes, type RouteConfig } from "@config";
import { getRateLimitMiddleware } from "@ratelimit";
import {
  gatewayAuthMiddleware,
  optionalGatewayAuthMiddleware,
  gatewayAdminAuthMiddleware,
  scrubOnlyMiddleware,
} from "@auth";
import { createProxyHandler } from "@proxy";

/**
 * Resolves the auth middleware for a route based on its `auth` level.
 * `none` routes use `scrubOnlyMiddleware` so forged identity headers
 * are still stripped before the proxy forwards the request.
 */
const resolveAuthMiddleware = (auth: RouteConfig["auth"]): RequestHandler => {
  switch (auth) {
    case "required":
      return gatewayAuthMiddleware;
    case "optional":
      return optionalGatewayAuthMiddleware;
    case "admin":
      return gatewayAdminAuthMiddleware;
    case "none":
      return scrubOnlyMiddleware;
  }
};

/**
 * Mounts the per-prefix middleware chain for every entry in
 * `config/routes.ts`.
 *
 * Chain per prefix: `auth → rateLimit → proxy`
 *
 * Order matters:
 * - auth runs first so `req.user` is populated before rate-limit
 *   keys on `userId`
 * - rate-limit runs after auth but before proxy so rate-limited
 *   requests never reach the upstream
 * - proxy is terminal
 *
 * The proxy itself (HPM cache, circuit breaker, method check) lives
 * in `src/proxy/proxyMiddleware.ts`. This file owns the *which* —
 * which routes, which auth, which preset — not the *how*.
 */
export const mountRoutes = (app: Application): void => {
  for (const route of routes) {
    const authMw = resolveAuthMiddleware(route.auth);
    const rateLimitMw = getRateLimitMiddleware(route.rateLimit);
    const proxyHandler = createProxyHandler(route);

    app.use(route.prefix, authMw, rateLimitMw, proxyHandler);
  }
};
