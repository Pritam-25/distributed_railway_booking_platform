import type { ErrorRequestHandler } from "express";
import { logger } from "@irctc/logger";
import { getRequestId, errorResponse } from "@irctc/http";
import { normalizeError } from "@irctc/errors";

/**
 * Error handler middleware to catch errors and return uniform error responses.
 * It normalizes errors, logs them with structured context, and sends appropriate HTTP responses.
 *
 * @param err - The raw error object caught by Express
 * @param req - The current Express Request object
 * @param res - The current Express Response object
 * @param next - Express NextFunction to delegate if headers are already sent
 */
const errorHandlerMiddleware: ErrorRequestHandler = (err, req, res, next) => {
  // If response headers have already been sent, delegate to default express error handler
  if (res.headersSent) {
    return next(err);
  }

  const normalizedError = normalizeError(err);
  const rawPath = req.originalUrl ?? req.url ?? req.path ?? "/";
  const sanitizedPath = rawPath.split("?")[0] || "/";

  const requestId = getRequestId();
  const log = requestId ? logger.child({ requestId }) : logger;

  if (normalizedError.statusCode >= 500) {
    log.error(
      {
        err,
        requestId,
        statusCode: normalizedError.statusCode,
        path: sanitizedPath,
        method: req.method,
        module: "http",
      },
      err instanceof Error ? err.message : "Unhandled error",
    );
  }

  return res.status(normalizedError.statusCode).json(errorResponse(err));
};

export default errorHandlerMiddleware;
