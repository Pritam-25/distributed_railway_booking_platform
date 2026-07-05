import type { Request, Response, NextFunction } from "express";
import { ApiError, ERROR_CODES } from "@irctc/errors";
import { statusCode } from "@irctc/http";

/**
 * Not found handler middleware to catch 404 errors and return uniform error responses.
 * @param _req Request object.
 * @param _res Response object.
 * @param next Next middleware.
 */
export const notFoundHandler = (
  _req: Request,
  _res: Response,
  next: NextFunction,
) => {
  next(new ApiError(statusCode.notFound, ERROR_CODES.NOT_FOUND));
};
