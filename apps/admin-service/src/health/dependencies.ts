/**
 * ## module/health/dependencies
 *
 * `admin-service` readiness probes. Each adapter is a `HealthDependency`
 * that `createHealthRouter` runs in parallel, bounded by a 5s timeout per
 * probe. Probe logic is lifted verbatim from the previous
 * `apps/admin-service/src/services/health.service.ts`.
 *
 * `admin-service` probes `database` (Prisma) and `kafka`; it does not
 * consume Redis.
 */

import { prisma, kafka } from "@config";
import { logger } from "@irctc/logger";
import type { HealthCheckResult, HealthDependency } from "@irctc/http";

/** Database probe */
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

/** Kafka probe */
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
 * Readiness probes registered with `createHealthRouter` for `admin-service`.
 */
export const healthDependencies: HealthDependency[] = [
  { name: "database", check: probeDatabase },
  { name: "kafka", check: probeKafka },
];
