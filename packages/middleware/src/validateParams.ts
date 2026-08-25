import type { ZodType } from "zod";
import { createValidationMiddleware } from "./createValidationMiddleware.js";

/**
 * Middleware that validates request path parameters against a Zod schema.
 * Replaces req.params with the coerced, parsed data on success.
 */
export const validateParams = (schema: ZodType) =>
  createValidationMiddleware(schema, {
    target: "params",
    errorMessage: "Invalid request parameters.",
  });
