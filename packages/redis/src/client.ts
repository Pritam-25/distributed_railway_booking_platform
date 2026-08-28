import { createRequire } from "node:module";
import type { Redis as RedisType, RedisOptions } from "ioredis";
import { logger } from "@irctc/logger";

/**
 * OpenTelemetry Redis Tracing ESM Workaround:
 * Under Node.js ESM (`"type": "module"`), static imports (e.g., `import { Redis } from "ioredis"`)
 * bypass the CommonJS `require` hooks that `@opentelemetry/instrumentation-ioredis` relies on
 * to auto-instrument the Redis client.
 *
 * To solve this, we resolve the client at runtime using Node's native `createRequire`.
 * This forces the loading of `ioredis` through the CommonJS pipeline, triggering OpenTelemetry's
 * auto-instrumentation hooks without requiring experimental/conflict-prone ESM loader flags.
 *
 * We statically import type information from "ioredis" separately to maintain full type-safety.
 */
const require = createRequire(import.meta.url);
const { Redis } = require("ioredis");

/**
 * Creates a centralized Redis client with standard exponential backoff
 * and observability event hooks.
 *
 * @param url - The Redis connection URL (e.g. `redis://localhost:6379`).
 * @param overrideOptions - Any additional ioredis options to override defaults.
 * @returns An initialized `Redis` client instance.
 */
export const createRedisClient = (
  url: string,
  overrideOptions?: RedisOptions,
): RedisType => {
  const client = new Redis(url, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
    retryStrategy: (times: number) => {
      // True exponential backoff capped at 2 seconds
      const delay = Math.min(50 * Math.pow(2, times - 1), 2000);
      return delay;
    },
    ...overrideOptions,
  });

  // Wires observability hooks
  client.on("connect", () => {
    // logger.info({ module: "redis" }, "Redis connection initiating..."),
  });
  client.on("ready", () =>
    logger.info({ module: "redis" }, "Redis connected successfully."),
  );
  client.on("close", () =>
    logger.warn({ module: "redis" }, "Redis connection closed"),
  );
  client.on("reconnecting", (delay: number) =>
    logger.info({ module: "redis" }, `Reconnecting to Redis in ${delay}ms`),
  );
  client.on("end", () =>
    logger.warn({ module: "redis" }, "Redis connection ended permanently"),
  );
  client.on("warning", (warning: Error) =>
    logger.warn({ module: "redis", err: warning }, "Redis runtime warning"),
  );
  client.on("error", (error: Error) =>
    logger.error(
      { module: "redis", err: error },
      "Redis execution error during client initialization.",
    ),
  );

  return client;
};

/**
 * Creates a dedicated Redis Subscriber client optimized for long-lived Pub/Sub connections.
 * Sets `maxRetriesPerRequest: null`, `enableReadyCheck: false`, and `autoResubscribe: true`
 * as required by ioredis for subscriber connections.
 *
 * @param url - Connection string (e.g. `redis://localhost:6379`).
 * @param overrideOptions - Optional overrides.
 */
export const createSubscriberClient = (
  url: string,
  overrideOptions?: RedisOptions,
): RedisType => {
  return createRedisClient(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    autoResubscribe: true,
    ...overrideOptions,
  });
};

/**
 * Ensures a Redis client is connected and ready to process commands during server bootstrap.
 *
 * @param client - Initialized Redis client instance.
 * @param timeoutMs - Bootstrap connection timeout in milliseconds (defaults to 5000ms).
 */
export const initRedis = async (
  client: RedisType,
  timeoutMs = 5000,
): Promise<void> => {
  if (client.status === "ready") return;

  return new Promise((resolve, reject) => {
    const onReady = () => {
      clearTimeout(timeout);
      client.off("error", onError);
      resolve();
    };

    const onError = (err: Error) => {
      clearTimeout(timeout);
      client.off("ready", onReady);
      reject(err);
    };

    const timeout = setTimeout(() => {
      client.off("ready", onReady);
      client.off("error", onError);
      reject(new Error("Redis connection timed out during bootstrap"));
    }, timeoutMs);

    client.once("ready", onReady);
    client.once("error", onError);
  });
};

/**
 * Gracefully closes an active Redis client connection.
 *
 * @param client - Initialized Redis client instance.
 */
export const disconnectRedis = async (client: RedisType): Promise<void> => {
  if (client.status !== "end") {
    logger.info(
      { module: "redis" },
      "Gracefully closing Redis connection channels",
    );
    await client.quit();
  }
};
