import { env } from "@config";
import {
  createRedisClient,
  initRedis as initRedisClient,
  disconnectRedis as disconnectRedisClient,
  type Redis,
} from "@irctc/redis";

const globalForRedis = globalThis as {
  redis?: Redis;
};

/**
 * Singleton Redis Command client instance.
 */
export const redis = globalForRedis.redis ?? createRedisClient(env.REDIS_URL);

if (env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
}

/**
 * Ensures the Redis client is connected and ready during server bootstrap.
 */
export const initRedis = async (): Promise<void> => {
  await initRedisClient(redis);
};

/**
 * Gracefully terminates the active Redis client connection.
 */
export const disconnectRedis = async (): Promise<void> => {
  await disconnectRedisClient(redis);
};
