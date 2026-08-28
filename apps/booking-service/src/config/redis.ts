import { env } from "@config";
import {
  createRedisClient,
  createSubscriberClient,
  initRedis as initRedisClient,
  disconnectRedis as disconnectRedisClient,
  type Redis,
} from "@irctc/redis";

const globalForRedis = globalThis as {
  redis?: Redis;
  redisSubscriber?: Redis;
};

/**
 * Singleton Redis Command client instance (for GET, SET, locks, PING, PUBLISH).
 */
export const redis = globalForRedis.redis ?? createRedisClient(env.REDIS_URL);

/**
 * Singleton dedicated Redis Subscriber client instance (for Pub/Sub SUBSCRIBE).
 */
export const redisSubscriber =
  globalForRedis.redisSubscriber ?? createSubscriberClient(env.REDIS_URL);

if (env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
  globalForRedis.redisSubscriber = redisSubscriber;
}

/**
 * Ensures both Redis command and subscriber clients are connected and ready during server bootstrap.
 */
export const initRedis = async (): Promise<void> => {
  await Promise.all([initRedisClient(redis), initRedisClient(redisSubscriber)]);
};

/**
 * Gracefully terminates both active Redis client connection channels.
 */
export const disconnectRedis = async (): Promise<void> => {
  await Promise.all([
    disconnectRedisClient(redis),
    disconnectRedisClient(redisSubscriber),
  ]);
};
