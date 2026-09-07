import type { ZodType } from "zod";
import { createValidationMiddleware } from "./createValidationMiddleware.js";

/**
 * Middleware that validates request query parameters against a Zod schema.
 * Replaces req.query with the coerced, parsed data on success.
 */
export const validateQuery = (schema: ZodType) =>
  createValidationMiddleware(schema, {
    target: "query",
    errorMessage: "Invalid request query parameters.",
  });
