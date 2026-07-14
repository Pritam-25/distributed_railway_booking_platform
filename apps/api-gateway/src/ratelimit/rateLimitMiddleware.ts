import type { Request, Response, NextFunction, RequestHandler } from "express";
import {
  TokenBucketRateLimiter,
  type RateLimitResult,
} from "@irctc/resilience";
import { redis } from "@config";
import { logger } from "@irctc/logger";
import { ApiError, ERROR_CODES } from "@irctc/errors";
import { statusCode, errorResponse } from "@irctc/http";
import { RATELIMIT_PRESETS, type RateLimitPresetName } from "./presets.js";
import type { AuthUser } from "@irctc/middleware";

/**
 * Singleton token-bucket limiter backed by the gateway's Redis client.
 * Exported so all per-route middleware instances share the same
 * Lua SHA cache (one SCRIPT LOAD, many EVALSHA).
 */
const limiter = new TokenBucketRateLimiter(redis, logger);

/**
 * Builds the rate-limit key for a request.
 *
 * - Authenticated requests (`req.user` populated) → keyed by userId so
 *   one user cannot exhaust the bucket for another.
 * - Unauthenticated requests → keyed by client IP. Behind a proxy
 *   this must be `req.ip`, which is the trust-gated `X-Forwarded-For`
 *   when `app.set("trust proxy", ...)` is configured.
 */
const buildKey = (req: Request): string => {
  const user = (req as Request & { user?: AuthUser }).user;
  if (user?.userId) return `rl:user:${user.userId}`;
  return `rl:ip:${req.ip ?? "unknown"}`;
};

/**
 * Per-preset Express middleware factory.
 *
 * Sets standard rate-limit headers on every response:
 * - `X-RateLimit-Limit`     — bucket capacity
 * - `X-RateLimit-Remaining` — tokens left after this request
 * - `Retry-After`           — seconds until the next token (only on 429)
 *
 * **Fail-open:** if the limiter (Redis) is unreachable, the request
 * is allowed through. Blocking traffic on a Redis outage cascades
 * the failure to every upstream — a worse outcome than a brief loss
 * of rate limiting.
 */
export const getRateLimitMiddleware = (
  presetName: RateLimitPresetName,
): RequestHandler => {
  const preset = RATELIMIT_PRESETS[presetName];

  return async function rateLimitMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    const key = buildKey(req);
    let result: RateLimitResult;

    try {
      result = await limiter.consume(key, {
        capacity: preset.capacity,
        refillPerSec: preset.refillPerSec,
      });
    } catch (err) {
      // Fail-open: Redis error must not block traffic.
      logger.warn(
        { module: "ratelimit", key, preset: presetName, err },
        "Rate limiter unavailable — failing open",
      );
      next();
      return;
    }

    res.setHeader("X-RateLimit-Limit", String(preset.capacity));
    res.setHeader("X-RateLimit-Remaining", String(result.remaining));

    if (result.allowed) {
      next();
      return;
    }

    const retryAfterSec = Math.max(1, Math.ceil(result.resetMs / 1000));
    res.setHeader("Retry-After", String(retryAfterSec));

    const apiError = new ApiError(
      statusCode.tooManyRequests,
      ERROR_CODES.RATE_LIMIT_EXCEEDED,
      "Too many requests. Please try again later.",
    );
    res.status(apiError.statusCode).json(errorResponse(apiError));
  };
};
