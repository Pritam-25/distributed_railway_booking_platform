import { env } from "@config";
import { logger } from "@irctc/logger";
import { createRedisClient } from "@irctc/redis";
import type { Redis } from "@irctc/redis";

const globalForRedis = globalThis as {
  redis?: Redis;
};

// Singleton export using centralized client
export const redis = globalForRedis.redis ?? createRedisClient(env.REDIS_URL);

/**
 * Ensures Redis is connected and ready to process commands.
 * This is critical for production bootstrap to avoid race conditions.
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

// Graceful termination handler for Kubernetes/Docker lifecycle
export const disconnectRedis = async (): Promise<void> => {
  if (redis.status !== "end") {
    logger.info(
      { module: "redis" },
      "Gracefully closing Redis connection channels",
    );
    await redis.quit();
  }
};
