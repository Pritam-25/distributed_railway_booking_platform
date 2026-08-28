import { logger } from "@irctc/logger";
import type { HealthCheckResult } from "./types.js";

/**
 * Interface satisfying any Elasticsearch client executing ping probes.
 */
export interface ElasticsearchLike {
  ping(
    params?: Record<string, unknown>,
    options?: Record<string, unknown>,
  ): Promise<unknown>;
}

/**
 * Probes Elasticsearch readiness with a bounded timeout.
 *
 * @param client - Elasticsearch client instance.
 * @param timeoutMs - Max execution time before failing health check (defaults to 5000ms).
 */
export const checkElasticsearchHealth = async (
  client: ElasticsearchLike,
  timeoutMs = 5000,
): Promise<HealthCheckResult> => {
  const start = Date.now();
  let timer: NodeJS.Timeout | undefined;

  try {
    const esPromise = client.ping();
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error("elasticsearch probe timeout")),
        timeoutMs,
      );
    });

    await Promise.race([esPromise, timeoutPromise]);
    return { ok: true, latencyMs: Date.now() - start };
  } catch (error) {
    logger.warn(
      { module: "health", err: error },
      "Elasticsearch readiness probe failed",
    );
    const errorMessage =
      error instanceof Error ? error.message : "elasticsearch probe failed";
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: errorMessage,
    };
  } finally {
    if (timer) clearTimeout(timer);
  }
};
