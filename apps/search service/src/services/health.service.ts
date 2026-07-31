import { elasticsearch, kafka, redis } from "@config";
import { logger } from "@irctc/logger";

/**
 * Per-dependency readiness probe result.
 */
export interface ReadinessCheck {
  name: string;
  ok: boolean;
  latencyMs: number;
  error?: string;
}

export type HealthChecks = Record<string, ReadinessCheck>;

let activeElasticsearchProbe: Promise<void> | null = null;

const runElasticsearchProbe = async (): Promise<void> => {
  try {
    await elasticsearch.ping();
  } finally {
    activeElasticsearchProbe = null;
  }
};

/**
 * Executes a bounded 5s ping probe against Elasticsearch with probe deduplication.
 */
const probeElasticsearch = async (): Promise<ReadinessCheck> => {
  const start = Date.now();
  let timeoutId: NodeJS.Timeout | undefined;

  try {
    activeElasticsearchProbe ??= runElasticsearchProbe();

    await Promise.race([
      activeElasticsearchProbe,
      new Promise<void>((_, reject) => {
        timeoutId = setTimeout(
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
    if (timeoutId) clearTimeout(timeoutId);
  }
};

let activeRedisProbe: Promise<string> | null = null;

const runRedisProbe = async (): Promise<string> => {
  try {
    return await redis.ping();
  } finally {
    activeRedisProbe = null;
  }
};

/**
 * Verifies Redis status and executes a bounded 5s ping probe validating `PONG` response.
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

    return {
      name: "redis",
      ok: true,
      latencyMs: Date.now() - start,
    };
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
 * Executes a bounded 5s Kafka Admin connection and topic list probe.
 */
const probeKafka = async (): Promise<ReadinessCheck> => {
  const start = Date.now();
  let timeoutId: NodeJS.Timeout | undefined;

  try {
    activeKafkaProbe ??= runKafkaProbe();

    const ok = await Promise.race([
      activeKafkaProbe,
      new Promise<boolean>((_, reject) => {
        timeoutId = setTimeout(
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
    if (timeoutId) clearTimeout(timeoutId);
  }
};

/**
 * ## HealthService
 *
 * Domain service aggregating readiness probes for external infrastructure dependencies.
 *
 * @remarks
 * ### Responsibilities
 * - Executes concurrent readiness probes for Elasticsearch, Kafka, and Redis.
 * - Enforces bounded 5-second timeouts and probe deduplication per dependency.
 * - Measures wall-clock latency per dependency for operator visibility.
 *
 * ### Storage & Infrastructure Probed
 * - **Elasticsearch**: Ping probe via {@link elasticsearch.ping}.
 * - **Redis**: Status check and ping probe (`PONG` validation).
 * - **Kafka**: Temporary Admin client connection and topic listing.
 */
export class HealthService {
  /**
   * Runs all dependency probes concurrently and aggregates results.
   *
   * @remarks
   * ### Responsibilities
   * - Initiates parallel readiness probes via {@link Promise.all}.
   * - Collects latency measurements and error states for each dependency.
   *
   * ### Side Effects
   * - Executes network ping and status checks against Elasticsearch, Kafka, and Redis.
   *
   * ### Failure Guarantees
   * - Individual dependency failures or timeouts (5s limit) do not throw; errors are captured in the returned result map.
   * @returns Object map of dependency name to {@link ReadinessCheck} result.
   */
  static async runReadinessChecks(): Promise<HealthChecks> {
    // 1. Execute concurrent dependency readiness probes for Elasticsearch, Kafka, and Redis
    const [elasticsearchCheck, kafkaCheck, redisCheck] = await Promise.all([
      probeElasticsearch(),
      probeKafka(),
      probeRedis(),
    ]);

    // 2. Aggregate per-dependency probe results into health map
    return {
      elasticsearch: elasticsearchCheck,
      kafka: kafkaCheck,
      redis: redisCheck,
    };
  }
}
