import type { ZodType } from "zod";
import type { Request, Response, NextFunction } from "express";
import { ApiError, COMMON_ERROR_CODES } from "@irctc/errors";
import { statusCode } from "@irctc/http";

export type RequestTarget = "body" | "query" | "params" | "headers";

export interface ValidationOptions {
  target: RequestTarget;
  errorMessage: string;
  checkEmptyBody?: boolean;
  getSubject?: (req: Request) => unknown;
  setSubject?: (req: Request, data: unknown) => void;
}

/**
 * Higher-order factory function that creates Express middleware to validate
 * request data against a Zod schema.
 */
export const createValidationMiddleware =
  (schema: ZodType, options: ValidationOptions) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (options.checkEmptyBody && !req.body) {
      throw new ApiError(
        statusCode.badRequest,
        COMMON_ERROR_CODES.INVALID_INPUT,
        "Request body is required.",
      );
    }

    const dataToValidate = options.getSubject
      ? options.getSubject(req)
      : req[options.target];

    const result = schema.safeParse(dataToValidate);

    if (!result.success) {
      const errors: Record<string, string> = {};

      result.error.issues.forEach((issue) => {
        const field = issue.path.length ? issue.path.join(".") : options.target;
        if (!errors[field]) {
          errors[field] = issue.message;
        }
      });

      throw new ApiError(
        statusCode.badRequest,
        COMMON_ERROR_CODES.INVALID_INPUT,
        options.errorMessage,
        errors,
      );
    }

    if (options.setSubject) {
      options.setSubject(req, result.data);
    } else if (options.target === "query" || options.target === "params") {
      Object.defineProperty(req, options.target, {
        value: result.data,
        writable: true,
        configurable: true,
        enumerable: true,
      });
    } else {
      (req as unknown as Record<string, unknown>)[options.target] = result.data;
    }

    next();
  };
