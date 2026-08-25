import type { ZodType } from "zod";
import { createValidationMiddleware } from "./createValidationMiddleware.js";

/**
 * Middleware that validates the request body against a Zod schema.
 * Throws a Bad Request (400) ApiError if the body is missing or fails validation.
 * Replaces req.body with the coerced, parsed data on success.
 *
 * @param schema - Zod schema to validate req.body against
 */
export const validateSchema = (schema: ZodType) =>
  createValidationMiddleware(schema, {
    target: "body",
    errorMessage: "Invalid request body.",
    checkEmptyBody: true,
  });
