import { env } from "@config";
import { logger } from "@irctc/logger";
import { createRedisClient } from "@irctc/redis";
import type { Redis } from "@irctc/redis";

const globalForRedis = globalThis as {
  redis?: Redis;
};

/**
 * Singleton Redis client instance exported for application-wide use.
 * Reuses the existing client cached on the global scope during development hot-reloads.
 */
export const redis = globalForRedis.redis ?? createRedisClient(env.REDIS_URL);

/**
 * Ensures Redis is connected and ready to process commands.
 * This is critical for production bootstrap to avoid race conditions.
 *
 * @returns A promise that resolves when the Redis client status is 'ready'.
 * @throws {Error} - If the connection times out or encounters an error.
 */
export const initRedis = async (): Promise<void> => {
  if (redis.status === "ready") return;

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
 * Gracefully terminates the active Redis client connection channels.
 * Recommended for use in shutdown hooks to ensure clean application exit.
 *
 * @returns A promise that resolves when the client successfully disconnects.
 */
export const disconnectRedis = async (): Promise<void> => {
  if (redis.status !== "end") {
    logger.info(
      { module: "redis" },
      "Gracefully closing Redis connection channels",
    );
    await redis.quit();
  }
};
