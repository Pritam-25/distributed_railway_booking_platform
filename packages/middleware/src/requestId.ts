import type { Request, Response, NextFunction } from "express";
import { randomUUID } from "node:crypto";
import { runWithRequestContext } from "@irctc/http";
import { logger } from "@irctc/logger";

const MAX_REQUEST_ID_LENGTH = 64;
const SAFE_REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Checks if the request ID is valid based on length and patterns (alphanumeric/dash/underscore or UUID v4).
 * @param value - The Request ID string to validate.
 * @returns True if the request ID format is valid, otherwise false.
 */
const isValidRequestId = (value: string): boolean => {
  if (!value || value.length > MAX_REQUEST_ID_LENGTH) {
    return false;
  }
  return SAFE_REQUEST_ID_PATTERN.test(value) || UUID_V4_PATTERN.test(value);
};

/**
 * Request ID middleware to assign or forward a unique correlation ID for each incoming HTTP request.
 * It does the following:
 * 1. Checks if a valid `x-request-id` header is present. If not, generates a new UUID v4.
 * 2. Attaches the `requestId` to the request object and response headers.
 * 3. Creates a child logger with the `requestId` injected for trace correlation.
 * 4. Runs the downstream request handling pipeline within an asynchronous request context.
 */
export const requestIdMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const incoming = req.headers["x-request-id"];
  let normalizedIncoming = "";
  if (Array.isArray(incoming)) {
    normalizedIncoming = incoming[0] ?? "";
  } else if (incoming !== undefined) {
    normalizedIncoming = String(incoming);
  }
  const trimmedIncoming = normalizedIncoming.trim();
  const requestId = isValidRequestId(trimmedIncoming)
    ? trimmedIncoming
    : randomUUID();

  runWithRequestContext({ requestId }, () => {
    (req as any).requestId = requestId;
    (req as any).logger = logger.child({ requestId });
    res.setHeader("X-Request-Id", requestId);
    // Write back to incoming headers so proxy and other middleware
    // can read req.headers["x-request-id"] consistently.
    req.headers["x-request-id"] = requestId;
    next();
  });
};
