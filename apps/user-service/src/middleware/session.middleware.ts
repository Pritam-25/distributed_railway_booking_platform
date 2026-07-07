import type { Request, Response, NextFunction } from "express";
import { redis } from "@config";
import { ApiError } from "@irctc/errors";
import { statusCode } from "@irctc/http";
import { ERROR_CODES } from "@utils/errors";
import { REDIS_KEYS, AUTH_DURATIONS } from "@utils/constants";

/**
 * Middleware that validates the user's active session in Redis.
 * Updates the lastUsedAt timestamp on the session and extends the TTLs of the session
 * and the user sessions index to keep them active.
 *
 * @param req - The Express Request object containing the populated user context.
 * @param res - The Express Response object.
 * @param next - The next middleware function.
 * @throws {ApiError} - If session context is missing, or the session is expired/revoked.
 */
export const sessionMiddleware = async (
  req: Request,
  _res: Response,
  next: NextFunction,
) => {
  const user = req.user;

  if (!user?.sessionId) {
    throw new ApiError(
      statusCode.unauthorized,
      ERROR_CODES.SESSION_CONTEXT_MISSING,
    );
  }

  const sessionKey = REDIS_KEYS.authSession(user.sessionId);
  const sessionJson = await redis.get(sessionKey);

  if (!sessionJson) {
    throw new ApiError(
      statusCode.unauthorized,
      ERROR_CODES.SESSION_EXPIRED_OR_REVOKED,
    );
  }

  // Optional: update lastUsedAt
  const session = JSON.parse(sessionJson);
  session.lastUsedAt = new Date().toISOString();
  await redis.set(
    sessionKey,
    JSON.stringify(session),
    "EX",
    AUTH_DURATIONS.SESSION_TTL_SECONDS,
  );

  // Refresh the user-sessions index TTL to keep sessions discoverable
  await redis.expire(
    REDIS_KEYS.userSessions(user.userId),
    AUTH_DURATIONS.SESSION_TTL_SECONDS,
  );

  next();
};
