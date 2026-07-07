import { prisma, redis, kafka } from "@config";
import { logger } from "@irctc/logger";

export type HealthChecks = {
  database: boolean;
  redis: boolean;
  kafka: boolean;
};

const DB_PROBE_TIMEOUT_MS = 5000;
const KAFKA_PROBE_TIMEOUT_MS = 5000;
const REDIS_PROBE_TIMEOUT_MS = 5000;

const probeDatabase = async (): Promise<boolean> => {
  const probe = async (): Promise<boolean> => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return true;
    } catch (err) {
      logger.warn({ module: "health", err }, "Database readiness probe failed");
      return false;
    }
  };
  let timeoutHandle: NodeJS.Timeout | undefined;
  const timeout = new Promise<boolean>((resolve) => {
    timeoutHandle = setTimeout(() => {
      logger.warn({ module: "health" }, "Database readiness probe timed out");
      resolve(false);
    }, DB_PROBE_TIMEOUT_MS);
  });
  try {
    return await Promise.race([probe(), timeout]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
};

const probeRedis = async (): Promise<boolean> => {
  const probe = async (): Promise<boolean> => {
    try {
      if (redis.status !== "ready") return false;
      const pong = await redis.ping();
      return pong === "PONG";
    } catch (err) {
      logger.warn({ module: "health", err }, "Redis readiness probe failed");
      return false;
    }
  };
  let timeoutHandle: NodeJS.Timeout | undefined;
  const timeout = new Promise<boolean>((resolve) => {
    timeoutHandle = setTimeout(() => {
      logger.warn({ module: "health" }, "Redis readiness probe timed out");
      resolve(false);
    }, REDIS_PROBE_TIMEOUT_MS);
  });
  try {
    return await Promise.race([probe(), timeout]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
};

/**
 * Real Kafka broker readiness check.
 *
 * We rely on the cluster's own health by listing topics, which round-trips
 * to a broker. This is a strong signal that the producer's connection is
 * still alive — far stronger than `instance !== null`, which can be true
 * even when `connect()` failed or the broker has since become unreachable.
 */

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
  }
};

const probeKafka = async (): Promise<boolean> => {
  activeKafkaProbe ??= runKafkaProbe().finally(() => {
    activeKafkaProbe = null;
  });

  let timeoutHandle: NodeJS.Timeout | undefined;
  const timeout = new Promise<boolean>((resolve) => {
    timeoutHandle = setTimeout(() => {
      logger.warn({ module: "health" }, "Kafka readiness probe timed out");
      resolve(false);
    }, KAFKA_PROBE_TIMEOUT_MS);
  });

  try {
    return await Promise.race([activeKafkaProbe, timeout]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
};

export class HealthService {
  static async runReadinessChecks(): Promise<HealthChecks> {
    const [database, redisOk, kafka] = await Promise.all([
      probeDatabase(),
      probeRedis(),
      probeKafka(),
    ]);

    return { database, redis: redisOk, kafka };
  }
}
