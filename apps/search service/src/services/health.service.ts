import { elasticsearch, kafka, redis } from "@config";
import { logger } from "@irctc/logger";

/**
 * Result of each dependency probe.
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
 * Probe Elasticsearch with a bounded 5s timeout and deduplicated query promise.
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
 * Probe Redis with a bounded 5s timeout and deduplicated query promise.
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
 * Probe Kafka with a bounded 5s timeout and deduplicated query promise.
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

export class HealthService {
  static async runReadinessChecks(): Promise<HealthChecks> {
    const [elasticsearch, kafka, redis] = await Promise.all([
      probeElasticsearch(),
      probeKafka(),
      probeRedis(),
    ]);

    return { elasticsearch, kafka, redis };
  }
}
