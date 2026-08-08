import { env } from "@config";
import { logger } from "@irctc/logger";
import { createRedisClient } from "@irctc/redis";
import type { Redis } from "@irctc/redis";

/**
 * `globalForRedis` is used to store the Redis client in the global scope.
 *
 * This is necessary because the Redis client is a **singleton** and should not be recreated
 * during hot-reloads in development.
 */
const globalForRedis = globalThis as {
  redis?: Redis;
};

/**
 * Singleton Redis client instance used application-wide for caching and idempotency.
 *
 * @remarks
 * ### Responsibilities
 * - Manages Redis connection pool.
 * - Caches client instance on global object during local development hot-reloads.
 */
export const redis = globalForRedis.redis ?? createRedisClient(env.REDIS_URL);

/**
 * Waits for the Redis client connection to reach the `ready` state during bootstrap.
 *
 * @remarks
 * ### Responsibilities
 * - Returns immediately if Redis status is already `ready`.
 * - Subscribes to `ready` and `error` events with a 5-second connection timeout guard.
 *
 * ### Side Effects
 * - **Redis**: Establishes connection to Redis cluster.
 *
 * ### Failure Guarantees
 * - Rejects after 5 seconds if Redis connection fails or times out.
 * @throws {Error} If Redis connection fails or times out during bootstrap.
 */
export const initRedis = async (): Promise<void> => {
  // 1. Return immediately if Redis is already connected
  if (redis.status === "ready") return;

  // 2. Wait for Redis ready event or 5-second timeout
  return new Promise((resolve, reject) => {
    const onReady = () => {
      clearTimeout(timeout);
      redis.off("error", onError);
      resolve();
    };

    const onError = (err: Error) => {
      clearTimeout(timeout);
      redis.off("ready", onReady);
      reject(err);
    };

    const timeout = setTimeout(() => {
      redis.off("ready", onReady);
      redis.off("error", onError);
      reject(new Error("Redis connection timed out during bootstrap"));
    }, 5000);

    redis.once("ready", onReady);
    redis.once("error", onError);
  });
};

// Cache instance on global scope during local development hot-reloads
if (env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
}

/**
 * Gracefully closes the Redis client connection pool.
 *
 * @remarks
 * ### Responsibilities
 * - Safely disconnects Redis socket channels if not already closed.
 *
 * ### Side Effects
 * - **Redis**: Closes client TCP connections.
 */
export const disconnectRedis = async (): Promise<void> => {
  // 1. Gracefully quit Redis client if connection is active
  if (redis.status !== "end") {
    logger.info(
      { module: "redis" },
      "Gracefully closing Redis connection channels",
    );
    await redis.quit();
  }
};
