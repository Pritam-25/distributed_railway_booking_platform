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

/**
 * Probe Redis with a bounded 5s timeout. The default ioredis timeout
 * is 30s+; without an explicit bound a slow Redis would hang the
 * readiness response and k8s would not mark the pod NotReady in time.
 *
 * Never throws — failures are converted to `{ ok: false, error }`.
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

    await Promise.race([
      redis.ping(),
      new Promise<string>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error("redis probe timeout")),
          5000,
        );
      }),
    ]);

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
      error: String(error),
    };
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

/**
 * Runs all readiness probes. Returns a flat map keyed by probe name
 * so the controller can render a single response payload.
 */
export const runReadinessChecks = async (): Promise<HealthChecks> => {
  // Probes run in parallel — total latency is the slowest probe, not
  // the sum. Keep each probe bounded (5s) so a hung dependency cannot
  // block the whole `/health/ready` response.
  const [redisCheck] = await Promise.all([probeRedis()]);
  return { redis: redisCheck };
};
