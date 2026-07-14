import { redis } from "@config";
import { logger } from "@irctc/logger";

/**
 * Result of each dependency probe. Mirrors the shape used by other
 * services' `/health/ready` handlers so dashboards can render the
 * result uniformly across the fleet.
 */
export interface ReadinessCheck {
  name: string;
  ok: boolean;
  latencyMs: number;
  error?: string;
}

export type HealthChecks = Record<string, ReadinessCheck>;

let activeRedisProbe: Promise<string> | null = null;

const runRedisProbe = async (): Promise<string> => {
  try {
    return await redis.ping();
  } finally {
    activeRedisProbe = null;
  }
};

/**
 * Probe Redis with a bounded 5s timeout and deduplicated query promise.
 * Avoids queueing up commands during connection stalls.
 */
const probeRedis = async (): Promise<ReadinessCheck> => {
  const start = Date.now();
  let timeoutId: NodeJS.Timeout | undefined;

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
        timeoutId = setTimeout(
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
    if (timeoutId) clearTimeout(timeoutId);
  }
};

export class HealthService {
  /**
   * Runs all readiness probes. Returns a flat map keyed by probe name
   * so the controller can render a single response payload.
   * @returns {Promise<HealthChecks>} hashmap of all readiness probes
   */
  static async runReadinessChecks(): Promise<HealthChecks> {
    const redisCheck = await probeRedis();
    return { redis: redisCheck };
  }
}
