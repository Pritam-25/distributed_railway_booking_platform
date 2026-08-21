import type { NextFunction, Request, Response } from "express";

import { redis } from "@config";
import { ApiError } from "@irctc/errors";
import { statusCode } from "@irctc/http";
import { ERROR_CODES } from "@utils/errors";
import { AUTH_DURATIONS, REDIS_KEYS } from "@utils/constants";

/**
 * Verifies the active session in Redis and extends its TTL on every authenticated request.
 *
 * @remarks
 * ### What This Middleware Does
 * 1. **Session Context Check**: Verifies `req.user.sessionId` was attached upstream by `trustGatewayHeaders`. If missing, short-circuits with `401`.
 * 2. **Stateful Redis Verification**: Loads session payload from `auth:session:<sessionId>` in Redis. If missing (revoked, logged out, or expired), short-circuits with `401`.
 * 3. **Activity Tracking**: Updates the session's `lastUsedAt` timestamp.
 * 4. **Sliding Session Window**: Resets the TTL of the session payload key and user-sessions index set in Redis to {@link AUTH_DURATIONS.SESSION_TTL_SECONDS}.
 *
 * ### Why This Is Needed (Stateful vs. Stateless Auth)
 * - `trustGatewayHeaders` only extracts stateless JWT identity claims injected by the API gateway edge. It does not communicate with Redis, which causes two limitations:
 *   - **No Immediate Revocation**: It cannot detect if a session was revoked (logout, password reset, or account ban) before the JWT's built-in expiry.
 *   - **No Sliding Session Window**: It cannot extend session lifetime based on user activity.
 * - `sessionMiddleware` provides **stateful verification** against Redis, enabling instant session revocation and sliding session expiration.
 *
 * ### Side Effects
 * - Reads `auth:session:<sessionId>` from Redis.
 * - Rewrites `auth:session:<sessionId>` with updated `lastUsedAt` and refreshed TTL.
 * - Touches TTL on `user:sessions:<userId>` index set.
 *
 * ### Response Guarantees
 * Downstream handlers can rely on the user's session having been validated in Redis and refreshed before execution.
 * @param req - Express request object containing user details.
 * @param _res - Express response object (unused).
 * @param next - Express continuation function to call the next middleware or handler.
 */
export const sessionMiddleware = async (
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> => {
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

  // 1. Refresh lastUsedAt so the session blob reflects the current request
  const session = JSON.parse(sessionJson);
  session.lastUsedAt = new Date().toISOString();

  // 2. Extend the session TTL — implements the sliding session window
  await redis.set(
    sessionKey,
    JSON.stringify(session),
    "EX",
    AUTH_DURATIONS.SESSION_TTL_SECONDS,
  );

  // 3. Refresh the user-sessions index TTL to keep sessions discoverable
  await redis.expire(
    REDIS_KEYS.userSessions(user.userId),
    AUTH_DURATIONS.SESSION_TTL_SECONDS,
  );

  next();
};
