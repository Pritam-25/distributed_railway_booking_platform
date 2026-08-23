/**
 * ## module/health/dependencies
 *
 * `search-service` readiness probes. Each adapter is a `HealthDependency`
 * that `createHealthRouter` runs in parallel, bounded by a 5s timeout per
 * probe. Probe logic is lifted verbatim from the previous
 * `apps/search service/src/services/health.service.ts`.
 *
 * `search-service` probes `elasticsearch`, `redis`, and `kafka`. It does
 * not own a database (read-only projection over Elasticsearch).
 */

import { logger } from "@irctc/logger";
import type { HealthCheckResult, HealthDependency } from "@irctc/http";
import { elasticsearch, kafka, redis } from "@config";

// --- Elasticsearch probe ----------------------------------------------------

let activeElasticsearchProbe: Promise<void> | null = null;

const runElasticsearchProbe = async (): Promise<void> => {
  try {
    await elasticsearch.ping();
  } finally {
    activeElasticsearchProbe = null;
  }
};

/**
 * Probes Elasticsearch with a bounded 5s timeout and a deduplicated
 * in-flight promise.
 */
const probeElasticsearch = async (): Promise<HealthCheckResult> => {
  const start = Date.now();
  let timer: NodeJS.Timeout | undefined;
  try {
    activeElasticsearchProbe ??= runElasticsearchProbe();
    await Promise.race([
      activeElasticsearchProbe,
      new Promise<void>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("elasticsearch probe timeout")),
          5000,
        );
      }),
    ]);
    return {
      name: "elasticsearch",
      ok: true,
      latencyMs: Date.now() - start,
    };
  } catch (error) {
    logger.warn(
      { module: "health", err: error },
      "Elasticsearch readiness probe failed",
    );
    return {
      name: "elasticsearch",
      ok: false,
      latencyMs: Date.now() - start,
      error: "elasticsearch probe failed",
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
 * Readiness probes registered with `createHealthRouter` for
 * `search-service`.
 */
export const healthDependencies: HealthDependency[] = [
  { name: "elasticsearch", check: probeElasticsearch },
  { name: "redis", check: probeRedis },
  { name: "kafka", check: probeKafka },
];
