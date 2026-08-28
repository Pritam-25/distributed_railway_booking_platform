import { logger } from "@irctc/logger";
import type { HealthCheckResult } from "./types.js";

/**
 * Interface satisfying any generated Prisma Client instance executing raw queries.
 */
export interface PrismaLike {
  $queryRaw(
    query: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<unknown>;
}

/**
 * Probes Database (PostgreSQL/Prisma) readiness with a bounded timeout.
 *
 * @param prisma - Prisma client instance.
 * @param timeoutMs - Max execution time before failing health check (defaults to 5000ms).
 */
export const checkDatabaseHealth = async (
  prisma: PrismaLike,
  timeoutMs = 5000,
): Promise<HealthCheckResult> => {
  const start = Date.now();
  let timer: NodeJS.Timeout | undefined;

  try {
    const dbPromise = prisma.$queryRaw`SELECT 1`;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error("database probe timeout")),
        timeoutMs,
      );
    });

    await Promise.race([dbPromise, timeoutPromise]);
    return { ok: true, latencyMs: Date.now() - start };
  } catch (error) {
    logger.warn(
      { module: "health", err: error },
      "Database readiness probe failed",
    );
    const errorMessage =
      error instanceof Error ? error.message : "database probe failed";
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: errorMessage,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
};
