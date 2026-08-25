import type { ZodType } from "zod";
import { createValidationMiddleware } from "./createValidationMiddleware.js";

/**
 * Normalizes string[] header values to single string values.
 */
const normalizeHeaders = (headers: Record<string, unknown>) => {
  const normalized: Record<string, unknown> = {};

  for (const key of Object.keys(headers)) {
    const rawVal = headers[key];
    normalized[key] = Array.isArray(rawVal) ? rawVal[0] : rawVal;
  }

  return normalized;
};

/**
 * Middleware that validates request headers against a Zod schema.
 * Throws a Bad Request (400) ApiError on validation failure.
 */
export const validateHeaders = (schema: ZodType) =>
  createValidationMiddleware(schema, {
    target: "headers",
    errorMessage: "Invalid request headers.",
    getSubject: (req) =>
      normalizeHeaders(req.headers as Record<string, unknown>),
    setSubject: (req, data) => {
      if (data && typeof data === "object") {
        Object.assign(req.headers, data);
      }
    },
  });
