import type {
  Admin,
  Kafka,
  KafkaHealthCheckResult,
  LoggerLike,
} from "./types.js";

/**
 * Probes Kafka readiness by instantiating a transient admin client and listing topics.
 * Returns a result matching `@irctc/http`'s `HealthCheckResult` signature.
 *
 * @param kafka - Initialized Kafka client instance.
 * @param logger - Optional diagnostic logger satisfying {@link LoggerLike}.
 * @param timeoutMs - Max execution time before failing health check (defaults to 5000ms).
 */
export const checkKafkaHealth = async (
  kafka: Kafka,
  logger?: LoggerLike,
  timeoutMs = 5000,
): Promise<KafkaHealthCheckResult> => {
  const start = Date.now();
  let timer: NodeJS.Timeout | undefined;
  let adminClient: Admin | null = null;

  try {
    adminClient = kafka.admin();
    const activeAdmin = adminClient;

    const probePromise = (async (): Promise<boolean> => {
      await activeAdmin.connect();
      await activeAdmin.listTopics();
      return true;
    })();

    const timeoutPromise = new Promise<boolean>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error("kafka probe timeout")),
        timeoutMs,
      );
    });

    const ok = await Promise.race([probePromise, timeoutPromise]);
    return {
      ok,
      latencyMs: Date.now() - start,
      ...(ok ? {} : { error: "kafka probe failed" }),
    };
  } catch (error) {
    logger?.warn(
      { module: "health", err: error },
      "Kafka readiness probe failed",
    );
    const errorMessage =
      error instanceof Error ? error.message : "kafka probe failed";
    return {
      ok: false,
      latencyMs: Date.now() - start,
      error: errorMessage,
    };
  } finally {
    if (timer) clearTimeout(timer);
    const toDisconnect: Admin | null = adminClient;
    if (toDisconnect !== null) {
      await toDisconnect.disconnect().catch((disconnectError: unknown) => {
        logger?.debug?.(
          { module: "health", err: disconnectError },
          "Non-fatal Kafka admin disconnect error during probe cleanup",
        );
      });
    }
  }
};
