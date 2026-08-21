import type { ErrorRequestHandler } from "express";
import { logger } from "@irctc/logger";
import { getRequestId, errorResponse, statusCode } from "@irctc/http";
import { ApiError, COMMON_ERROR_CODES, normalizeError } from "@irctc/errors";

/**
 * ## Centralized Express Error Middleware
 *
 * Converts any unhandled application or framework error into a
 * standardized API error response.
 *
 * ### Responsibilities
 * - Converts malformed JSON payloads into a `400 Bad Request`.
 * - Normalizes all thrown values into the project's canonical error format.
 * - Logs unexpected server-side failures (HTTP 5xx).
 * - Returns a consistent JSON error envelope.
 *
 * Application-originated errors should be instances of {@link ApiError},
 * while unknown or framework errors are normalized through
 * {@link normalizeError}.
 *
 * @param err - The error propagated by Express or application code.
 * @param req - The current HTTP request.
 * @param res - The HTTP response used to send the standardized error payload.
 * @param next - Delegates to Express when the response has already started.
 * @returns A standardized JSON error response, or delegates to the next
 * error handler if the response has already begun.
 */
const errorHandlerMiddleware: ErrorRequestHandler = (err, req, res, next) => {
  // Delegate to Express if the response has already started.
  if (res.headersSent) {
    return next(err);
  }

  /**
   * Convert body-parser JSON syntax failures into a first-class ApiError.
   *
   * Without this translation, malformed JSON payloads would be treated as
   * unexpected errors and could produce an incorrect error code or response body.
   */
  let operationalError = err;
  if (
    err instanceof SyntaxError &&
    "status" in err &&
    err.status === 400 &&
    "body" in err
  ) {
    operationalError = new ApiError(
      statusCode.badRequest,
      COMMON_ERROR_CODES.INVALID_INPUT,
      "Malformed JSON payload syntax provided.",
    );
  }

  /**
   * Normalize every error into the project's canonical representation so that
   * status codes and error metadata remain consistent.
   */
  const normalizedError = normalizeError(operationalError);

  const rawPath = req.originalUrl ?? req.url ?? req.path ?? "/";
  const sanitizedPath = rawPath.split("?")[0] || "/";
  const requestId = getRequestId();
  const log = requestId ? logger.child({ requestId }) : logger;

  /**
   * Only unexpected server errors (5xx) are logged because client errors (4xx)
   * are considered expected operational failures.
   */
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

  /**
   * Use the rewritten operational error instead of the original error when
   * generating the response body. This ensures that transformed errors (such as
   * malformed JSON payloads) produce both the correct HTTP status code and the
   * matching standardized error payload.
   */
  return res
    .status(normalizedError.statusCode)
    .json(errorResponse(operationalError));
};

export default errorHandlerMiddleware;
