import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { env } from "@config";
import { COOKIE_NAMES } from "@utils/constants";
import { ApiError } from "@irctc/errors";
import { statusCode } from "@irctc/http";
import { ERROR_CODES } from "@utils/errors";

declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        sessionId: string;
      };
    }
  }
}

export interface AccessTokenPayload {
  sub: string;
  email: string;
  sessionId: string;
  type: "access";
}

export interface RefreshTokenPayload {
  sub: string;
  sessionId: string;
  type: "refresh";
}

/**
 * Middleware that requires a valid access token in cookies or authorization header.
 * Decodes the token and populates the user context on the request object.
 *
 * @param req - The Express Request object.
 * @param res - The Express Response object.
 * @param next - The next middleware function.
 * @throws {ApiError} - If token is missing, expired, or invalid.
 */
export const requireUser = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
  let token = req.cookies[COOKIE_NAMES.ACCESS_TOKEN] as string | undefined;

  if (!token && req.headers.authorization?.startsWith("Bearer ")) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    throw new ApiError(
      statusCode.unauthorized,
      ERROR_CODES.ACCESS_TOKEN_MISSING,
    );
  }

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as AccessTokenPayload;

    if (decoded.type !== "access") {
      throw new ApiError(
        statusCode.unauthorized,
        ERROR_CODES.INVALID_TOKEN_TYPE,
      );
    }

    req.user = {
      userId: decoded.sub,
      sessionId: decoded.sessionId,
    };

    next();
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    throw new ApiError(
      statusCode.unauthorized,
      ERROR_CODES.SESSION_EXPIRED_OR_REVOKED,
      "Access token is invalid or has expired",
      error,
    );
  }
};
