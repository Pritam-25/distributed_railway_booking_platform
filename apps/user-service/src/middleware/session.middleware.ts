import type { NextFunction, Request, Response } from "express";

import { redis } from "@config";
import { ApiError } from "@irctc/errors";
import { statusCode } from "@irctc/http";
import { ERROR_CODES } from "@utils/errors";
import { AUTH_DURATIONS, REDIS_KEYS } from "@utils/constants";

/**
 * Middleware that checks if a user is logged in with a valid session.
 *
 * What this middleware does:
 * 1. Checks if the request has a session ID. If not, stops and returns a "not authorized" error.
 * 2. Loads the session data from Redis. If the session is missing, stops and returns a "session expired or logged out" error.
 * 3. Updates the session's last active time to now.
 * 4. Extends the session's expiration timer in Redis so the user stays logged in while actively using the app.
 *
 * Why we need this (alongside requireUser):
 * - requireUser only verifies the JWT signature (stateless). Because it doesn't talk to Redis, it has two major limitations:
 *     1. No immediate revocation: It cannot detect if a session was deleted (e.g. if the user logged out, changed their password, or got banned) before the JWT's built-in expiry time runs out.
 *     2. No sliding session window: It cannot extend the user's active session length based on their activity.
 * - This middleware checks if the session is still active in Redis (stateful), solving both limitations by enabling immediate session termination and resetting the session expiration time on every request.
 *
 * @param req - The Request object containing user details.
 * @param _res - The Response object (unused).
 * @param next - The function to call the next middleware/handler.
 * @throws {ApiError} - If there is no session ID, or if the session is expired/logged out.
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
