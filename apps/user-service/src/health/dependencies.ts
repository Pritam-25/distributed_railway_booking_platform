/**
 * ## module/health/dependencies
 *
 * `user-service` readiness probes. Each adapter is a `HealthDependency` that
 * `createHealthRouter` runs in parallel, bounded by a 5s timeout per probe.
 *
 * The probe logic is lifted verbatim from the previous
 * `apps/user-service/src/services/health.service.ts`. Every probe converts
 * failures to `{ ok: false, error }` instead of throwing, and deduplicates
 * concurrent calls via a module-level singleton so a flood of
 * `/health/ready` requests does not stampede the dependency.
 */

import { logger } from "@irctc/logger";
import type { HealthCheckResult, HealthDependency } from "@irctc/http";
import { prisma, redis, kafka } from "@config";

// --- Database probe ---------------------------------------------------------

let activeDbProbe: Promise<void> | null = null;

const runDbProbe = async (): Promise<void> => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } finally {
    activeDbProbe = null;
  }
};

/**
 * Probes PostgreSQL with a bounded 5s timeout and a deduplicated in-flight
 * promise.
 *
 * ### Side Effects
 * - **PostgreSQL**: Executes a `SELECT 1` query.
 *
 * ### Failure Guarantees
 * - Probe errors and timeouts are converted to a `{ ok: false }` result;
 *   no exception is re-thrown.
 */
const probeDatabase = async (): Promise<HealthCheckResult> => {
  const start = Date.now();
  let timer: NodeJS.Timeout | undefined;
  try {
    activeDbProbe ??= runDbProbe();
    await Promise.race([
      activeDbProbe,
      new Promise<void>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("database probe timeout")),
          5000,
        );
      }),
    ]);
    return { name: "database", ok: true, latencyMs: Date.now() - start };
  } catch (error) {
    logger.warn(
      { module: "health", err: error },
      "Database readiness probe failed",
    );
    return {
      name: "database",
      ok: false,
      latencyMs: Date.now() - start,
      error: "database probe failed",
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
};

// --- Redis probe ------------------------------------------------------------

let activeRedisProbe: Promise<string> | null = null;

const runRedisProbe = async (): Promise<string> => {
  try {
    return await redis.ping();
  } finally {
    activeRedisProbe = null;
  }
};

/**
 * Probes Redis with a bounded 5s timeout and a deduplicated in-flight
 * promise.
 *
 * ### Side Effects
 * - **Redis**: Issues a `PING` and verifies the response.
 *
 * ### Failure Guarantees
 * - Probe errors and timeouts are converted to a `{ ok: false }` result;
 *   no exception is re-thrown.
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

// --- Kafka probe ------------------------------------------------------------

let activeKafkaProbe: Promise<boolean> | null = null;

const runKafkaProbe = async (): Promise<boolean> => {
  let admin = null;
  try {
    admin = kafka.admin();
    await admin.connect();
    await admin.listTopics();
    return true;
  } catch (err) {
    logger.warn({ module: "health", err }, "Kafka readiness probe failed");
    return false;
  } finally {
    if (admin) {
      await admin.disconnect().catch(() => {
        // Disconnect failures are non-fatal for a readiness probe.
      });
    }
    activeKafkaProbe = null;
  }
};

/**
 * Probes Kafka with a bounded 5s timeout and a deduplicated in-flight
 * promise.
 *
 * ### Side Effects
 * - **Kafka**: Connects an admin client and lists topics.
 *
 * ### Failure Guarantees
 * - Probe errors and timeouts are converted to a `{ ok: false }` result;
 *   no exception is re-thrown.
 */
const probeKafka = async (): Promise<HealthCheckResult> => {
  const start = Date.now();
  let timer: NodeJS.Timeout | undefined;
  try {
    activeKafkaProbe ??= runKafkaProbe();
    const ok = await Promise.race([
      activeKafkaProbe,
      new Promise<boolean>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("kafka probe timeout")),
          5000,
        );
      }),
    ]);
    return {
      name: "kafka",
      ok,
      latencyMs: Date.now() - start,
      ...(ok ? {} : { error: "kafka probe failed" }),
    };
  } catch (error) {
    logger.warn(
      { module: "health", err: error },
      "Kafka readiness probe failed",
    );
    return {
      name: "kafka",
      ok: false,
      latencyMs: Date.now() - start,
      error: "kafka probe timeout",
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
};

/**
 * Readiness probes registered with `createHealthRouter` for `user-service`.
 *
 * `database` → Prisma `SELECT 1`
 * `redis`    → `redis.ping()` verifying `PONG`
 * `kafka`    → admin client `listTopics()`
 */
export const healthDependencies: HealthDependency[] = [
  { name: "database", check: probeDatabase },
  { name: "redis", check: probeRedis },
  { name: "kafka", check: probeKafka },
];
