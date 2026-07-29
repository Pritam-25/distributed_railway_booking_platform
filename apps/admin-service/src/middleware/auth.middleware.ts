import type { Request, Response, NextFunction } from "express";
import { ApiError, COMMON_ERROR_CODES } from "@irctc/errors";
import { statusCode } from "@irctc/http";
import { logger } from "@irctc/logger";
import { type AuthAdmin } from "@irctc/middleware";

export const readAdminFromHeaders = (
  headers: Record<string, string | string[] | undefined>,
): AuthAdmin | null => {
  const adminId = headers["x-admin-id"];
  const normalizedAdminId = Array.isArray(adminId) ? adminId[0] : adminId;

  if (!normalizedAdminId) {
    return null;
  }

  return { adminId: normalizedAdminId };
};

/**
 * Middleware to require a trusted admin context propagated from the API Gateway.
 * Validates the presence of admin identity headers and attaches the decoded admin metadata.
 */
export const requireAdmin = (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const admin = readAdminFromHeaders(req.headers);

  if (!admin) {
    logger.warn(
      {
        reason: "Missing x-admin-id header",
      },
      "Admin authentication failed",
    );
    throw new ApiError(
      statusCode.unauthorized,
      COMMON_ERROR_CODES.UNAUTHORIZED,
      "Administrator authentication required",
    );
  }

  // Attach admin information to the request for downstream middlewares and controllers
  req.admin = admin;

  next();
};
