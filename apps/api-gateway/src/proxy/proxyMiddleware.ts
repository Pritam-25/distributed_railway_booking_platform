import type { RequestHandler } from "express";
import { createProxyMiddleware as createHPM } from "http-proxy-middleware";
import type {
  Options as HPMOptions,
  RequestHandler as HPMRequestHandler,
} from "http-proxy-middleware";
import { logger } from "@irctc/logger";
import {
  CircuitBreakerOpenError,
  CircuitBreakerTimeoutError,
} from "@irctc/resilience";
import { getBreaker } from "@resilience";
import { ApiError } from "@irctc/errors";
import { statusCode } from "@irctc/http";
import { GATEWAY_ERROR_CODES } from "@utils";
import type { RouteConfig } from "@config";

/**
 * Per-upstream HPM instance cache. Each upstream gets exactly one
 * proxy instance so connection pooling and TCP keep-alive are
 * reused across every route that targets it.
 */
const proxyCache = new Map<string, HPMRequestHandler>();

const getOrCreateProxy = (
  upstreamName: string,
  baseUrl: string,
): HPMRequestHandler => {
  const cached = proxyCache.get(upstreamName);
  if (cached) return cached;

  const options: HPMOptions = {
    target: baseUrl,
    changeOrigin: true,
    pathRewrite: (_path, req) => {
      // Reconstruct path from originalUrl (since Express app.use strips baseUrl from req.url)
      return (req as any).originalUrl.replace(/^\/api\/v1/, "");
    },
    on: {
      error: (err, _req, _res) => {
        // Connection-level failure (ECONNREFUSED, ECONNRESET, DNS error).
        // The promise returned by `proxy()` rejects with the same error,
        // which propagates to the outer catch in `createProxyHandler` and
        // is translated to a 502 ApiError via the central error pipeline.
        // We log here so the failure is recorded with the upstream name
        // even if the response was partially written before the failure.
        logger.error(
          { module: "proxy", upstream: upstreamName, err },
          `Proxy error for upstream "${upstreamName}"`,
        );
      },
    },
  };

  const proxy = createHPM(options);
  proxyCache.set(upstreamName, proxy);
  return proxy;
};

type ExpressRequest = Parameters<RequestHandler>[0];
type ExpressResponse = Parameters<RequestHandler>[1];

/**
 * Wraps the HTTP proxy execution in a Promise so the circuit breaker
 * can `await` it. Resolves when the response is closed (regardless
 * of upstream success) and rejects only on proxy-level errors.
 */
const runProxy = (
  proxy: HPMRequestHandler,
  req: ExpressRequest,
  res: ExpressResponse,
): Promise<void> => {
  return new Promise<void>((resolve, reject) => {
    const onClose = () => resolve();
    res.on("close", onClose);
    proxy(req, res, (err?: unknown) => {
      if (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
      }
    });
  });
};

/**
 * Builds a per-route terminal handler that:
 *  1. Verifies HTTP method (405 if not in `route.methods`)
 *  2. Wraps the proxy call in the upstream's circuit breaker
 *  3. Forwards the request to the upstream via `http-proxy-middleware`
 *
 * Auth + rate-limit + header scrubbing run on `app` BEFORE this
 * handler is invoked (they are mounted on the route prefix by
 * `routing/mountRoutes.ts`). The handler is the terminal proxy
 * step only — it does no auth, no rate limiting, no header work.
 */
export const createProxyHandler = (route: RouteConfig): RequestHandler => {
  const proxy = getOrCreateProxy(route.upstream.name, route.upstream.baseUrl);
  const breaker = getBreaker(route.upstream.circuitName);

  return async function proxyHandler(req, res, next) {
    // 1. Method check (defence in depth — most filtering happens upstream)
    if (
      route.methods &&
      route.methods.length > 0 &&
      !route.methods.includes(req.method.toUpperCase())
    ) {
      next(
        new ApiError(
          statusCode.methodNotAllowed,
          GATEWAY_ERROR_CODES.METHOD_NOT_ALLOWED,
          `Method ${req.method} not allowed for ${route.prefix}`,
        ),
      );
      return;
    }

    const startTime = Date.now();
    const requestId =
      (req as { requestId?: string }).requestId ??
      (req.headers["x-request-id"] as string | undefined) ??
      "";
    const traceId = (res.getHeader("X-Trace-Id") as string | undefined) ?? "";
    const userId =
      (req as { user?: { userId?: string } }).user?.userId ?? "anonymous";
    const upstream = route.upstream.name;
    const circuitName = route.upstream.circuitName;
    const logBase = {
      module: "proxy",
      upstream,
      circuitName,
      requestId,
      traceId,
      userId,
      method: req.method,
      path: req.originalUrl,
    };

    try {
      await breaker.execute(() => runProxy(proxy, req, res));

      const durationMs = Date.now() - startTime;
      const statusCode = res.statusCode;

      // ERROR_CODES.* — upstream returned a 5xx
      if (statusCode >= 500) {
        logger.error(
          {
            ...logBase,
            statusCode,
            durationMs,
            circuitState: breaker.getState(),
          },
          `Proxy request to ${upstream} failed`,
        );
        return;
      }

      logger.info(
        {
          ...logBase,
          statusCode,
          durationMs,
          circuitState: breaker.getState(),
        },
        `Proxy request to ${upstream} succeeded`,
      );
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const circuitState = breaker.getState();

      // ERROR_CODES.GATEWAY_UPSTREAM_CIRCUIT_OPEN
      // ERROR_CODES.GATEWAY_UPSTREAM_ERROR
      logger.error(
        { ...logBase, err: error, durationMs, circuitState },
        `Proxy request to ${upstream} failed`,
      );

      if (res.headersSent) return;

      if (error instanceof CircuitBreakerOpenError) {
        next(
          new ApiError(
            statusCode.serviceUnavailable,
            GATEWAY_ERROR_CODES.GATEWAY_UPSTREAM_CIRCUIT_OPEN,
            `Service is temporarily unavailable (circuit breaker "${circuitName}" is OPEN)`,
          ),
        );
        return;
      }
      if (error instanceof CircuitBreakerTimeoutError) {
        next(
          new ApiError(
            statusCode.gatewayTimeout,
            GATEWAY_ERROR_CODES.GATEWAY_UPSTREAM_ERROR,
            "Upstream request timed out",
          ),
        );
        return;
      }

      // Any other proxy failure (connection refused, ECONNRESET, etc.)
      next(
        new ApiError(
          statusCode.badGateway,
          GATEWAY_ERROR_CODES.GATEWAY_UPSTREAM_ERROR,
          "Upstream service is unavailable",
        ),
      );
    }
  };
};
