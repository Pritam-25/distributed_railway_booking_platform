import type { Request, Response, NextFunction } from "express";
import { getTraceId } from "@irctc/http";
import { logger } from "@irctc/logger";

/**
 * Middleware that logs HTTP request details upon request completion.
 * Measures response duration and logs request metadata (HTTP method, path, status code, client IP, request/trace IDs)
 * with appropriate log level based on response status code (error for 5xx, warn for 4xx, info for others).
 */
export const requestLoggerMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const start = Date.now();
  let logged = false;

  // Handler to log request details once it finishes or closes
  const logRequest = () => {
    if (logged) return;
    logged = true;
    const duration = Date.now() - start;
    const rawPath = req.originalUrl ?? req.url ?? req.path ?? "/";
    const sanitizedPath = rawPath.split("?")[0] || "/";

    const logMeta = {
      method: req.method,
      path: sanitizedPath,
      requestId: req.requestId,
      traceId: getTraceId(),
      statusCode: res.statusCode,
      durationMs: duration,
      remoteAddress: req.ip,
      module: "http",
    };

    const message = "request completed";
    const log = req.logger ?? logger;

    if (res.statusCode >= 500) {
      log.error(logMeta, message);
    } else if (res.statusCode >= 400) {
      log.warn(logMeta, message);
    } else {
      log.info(logMeta, message);
    }
  };

  res.on("finish", logRequest);
  res.on("close", logRequest);

  next();
};
