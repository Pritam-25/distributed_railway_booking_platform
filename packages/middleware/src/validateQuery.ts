import type { ZodType } from "zod";
import type { Request, Response, NextFunction } from "express";
import { ApiError, ERROR_CODES } from "@irctc/errors";
import { statusCode } from "@irctc/http";

/**
 * Middleware that validates request query parameters against a Zod schema.
 * Replaces req.query with the coerced, parsed data on success.
 */
export const validateQuery =
  (schema: ZodType) => (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);

    if (!result.success) {
      const errors: Record<string, string> = {};

      result.error.issues.forEach((issue) => {
        const field = issue.path.length ? issue.path.join(".") : "query";
        if (!errors[field]) {
          errors[field] = issue.message;
        }
      });

      throw new ApiError(
        statusCode.badRequest,
        ERROR_CODES.INVALID_INPUT,
        "Invalid request query parameters.",
        errors,
      );
    }

    Object.defineProperty(req, "query", {
      value: result.data,
      writable: true,
      configurable: true,
      enumerable: true,
    });
    next();
  };
