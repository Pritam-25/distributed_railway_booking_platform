/**
 * ## module/health/dependencies
 *
 * `api-gateway` readiness probes. Each adapter is a `HealthDependency`
 * that `createHealthRouter` runs in parallel, bounded by a 5s timeout per
 * probe. Probe logic is lifted verbatim from the previous
 * `apps/api-gateway/src/health/health.service.ts`.
 *
 * `api-gateway` probes `redis` only — it depends on Redis for rate
 * limiting but has no database and is stateless otherwise.
 */

import { logger } from "@irctc/logger";
import type { HealthCheckResult, HealthDependency } from "@irctc/http";
import { redis } from "@config";

let activeRedisProbe: Promise<string> | null = null;

const runRedisProbe = async (): Promise<string> => {
  try {
    return await redis.ping();
  } finally {
    activeRedisProbe = null;
  }
};

/**
 * Probes Redis with a bounded 5s timeout. Returns `ok: false` immediately
 * if the client is not in the `"ready"` state.
 */
const probeRedis = async (): Promise<HealthCheckResult> => {
  const start = Date.now();
  let timer: NodeJS.Timeout | undefined;
  try {
    if (redis.status !== "ready") {
      logger.warn(
        { module: "health" },
        `Redis not ready for probe (status: ${redis.status})`,
      );
      return {
        name: "redis",
        ok: false,
        latencyMs: Date.now() - start,
        error: `redis status: ${redis.status}`,
      };
    }

    activeRedisProbe ??= runRedisProbe();

    const pong = await Promise.race([
      activeRedisProbe,
      new Promise<string>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("redis probe timeout")),
          5000,
        );
      }),
    ]);

    if (pong !== "PONG") {
      throw new Error(`Unexpected Redis ping response: ${pong}`);
    }

    return { name: "redis", ok: true, latencyMs: Date.now() - start };
  } catch (error) {
    logger.warn(
      { module: "health", err: error },
      "Redis readiness probe failed",
    );
    return {
      name: "redis",
      ok: false,
      latencyMs: Date.now() - start,
      error: "redis probe failed",
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
};

/**
 * Readiness probes registered with `createHealthRouter` for `api-gateway`.
 */
export const healthDependencies: HealthDependency[] = [
  { name: "redis", check: probeRedis },
];
