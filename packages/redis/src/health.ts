import { logger } from "@irctc/logger";
import type { Redis } from "ioredis";
import type { RedisHealthCheckResult } from "./types.js";

/**
 * Executes a readiness PING health check against the command Redis client with an explicit timeout.
 * Returns a result matching `@irctc/http`'s `HealthCheckResult` signature.
 * MUST only be called on command clients (not subscriber clients).
 *
 * @param client - Command Redis client instance.
 * @param timeoutMs - Max execution time before failing health check (defaults to 5000ms).
 */
export const checkRedisHealth = async (
  client: Redis,
  timeoutMs = 5000,
): Promise<RedisHealthCheckResult> => {
  const start = Date.now();

  if (client.status !== "ready") {
    logger.warn(
      { module: "health" },
      `Redis not ready for probe (status: ${client.status})`,
    );
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: `redis status: ${client.status}`,
    };
  }

  let timer: NodeJS.Timeout | undefined;
  try {
    const pingPromise = client.ping();
    const timeoutPromise = new Promise<string>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error("redis probe timeout")),
        timeoutMs,
      );
    });

    const pong = await Promise.race([pingPromise, timeoutPromise]);
    if (pong !== "PONG") {
      throw new Error(`Unexpected Redis ping response: ${pong}`);
    }

    return { ok: true, latencyMs: Date.now() - start };
  } catch (error) {
    logger.warn(
      { module: "health", err: error },
      "Redis readiness probe failed",
    );
    const errorMessage =
      error instanceof Error ? error.message : "redis probe failed";
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: errorMessage,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
};
