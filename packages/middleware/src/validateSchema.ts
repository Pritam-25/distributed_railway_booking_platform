import type { ZodType } from "zod";
import type { Request, Response, NextFunction } from "express";
import { ApiError, ERROR_CODES } from "@irctc/errors";
import { statusCode } from "@irctc/http";

/**
 * Middleware that validates the request body against a Zod schema.
 * Throws a Bad Request (400) ApiError if the body is missing or fails validation.
 * Replaces req.body with the coerced, parsed data on success.
 *
 * @param schema - Zod schema to validate req.body against
 */
export const validateSchema =
  (schema: ZodType) => (req: Request, _res: Response, next: NextFunction) => {
    if (!req.body) {
      throw new ApiError(
        statusCode.badRequest,
        ERROR_CODES.INVALID_INPUT,
        "Request body is required.",
      );
    }

    const result = schema.safeParse(req.body);

    if (!result.success) {
      const errors: Record<string, string> = {};

      result.error.issues.forEach((issue) => {
        const field = issue.path.length ? issue.path.join(".") : "body";
        if (!errors[field]) {
          errors[field] = issue.message;
        }
      });

      throw new ApiError(
        statusCode.badRequest,
        ERROR_CODES.INVALID_INPUT,
        "Invalid request body.",
        errors,
      );
    }

    req.body = result.data;
    next();
  };
