import {
  env,
  disconnectRedis,
  initRedis,
  initKafka,
  disconnectKafka,
} from "@config";
import { logger } from "@irctc/logger";
import { shutdownTelemetry } from "@irctc/telemetry";

let isShuttingDown = false;
let isContainerInitialized = false;

/**
 * Executes a promise-based operation with a maximum timeout threshold.
 *
 * @param label - Diagnostic label used in case of timeouts.
 * @param op - The promise representing the async operation.
 * @param ms - The timeout limit in milliseconds.
 * @returns A promise resolving to the operation result.
 * @throws {Error} - If the timeout is reached.
 */
const withTimeout = async <T>(
  label: string,
  op: Promise<T>,
  ms = 5000,
): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      op,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

/**
 * Performs graceful shutdown of the notification worker.
 * Shuts down consumer subscription loops first to avoid consuming new events,
 * then closes the Kafka connection, Redis client, and shuts down telemetry.
 *
 * @param signal - The OS signal received triggering shutdown.
 * @param exitCode - Process exit code to return.
 */
const shutdown = async (signal: NodeJS.Signals, exitCode = 0) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  let hadError = false;

  logger.info(
    { module: "server" },
    `Received ${signal}, shutting down notification service worker gracefully...`,
  );

  // 1. Disconnect Kafka event consumers first
  if (isContainerInitialized) {
    try {
      const { NotificationContainer } = await import("./container/index.js");
      await withTimeout(
        "Consumers stop",
        NotificationContainer.getInstance().disconnect(),
      );
      logger.info({ module: "server" }, "Consumers stopped successfully.");
    } catch (error) {
      logger.error(
        { module: "server", err: error },
        "Error occurred while stopping consumers.",
      );
      hadError = true;
    }
  }

  // 2. Disconnect Kafka client
  try {
    await withTimeout("Kafka disconnect", disconnectKafka());
    logger.info({ module: "server" }, "Kafka connection closed.");
  } catch (error) {
    logger.error(
      { module: "server", err: error },
      "Error occurred while disconnecting Kafka.",
    );
    hadError = true;
  }

  // 3. Disconnect Redis client
  try {
    await withTimeout("Redis disconnect", disconnectRedis());
    logger.info({ module: "server" }, "Redis connection closed.");
  } catch (error) {
    logger.error(
      { module: "server", err: error },
      "Error occurred while disconnecting Redis.",
    );
    hadError = true;
  }

  // 4. Shutdown Telemetry exporter
  try {
    await withTimeout("Telemetry shutdown", shutdownTelemetry());
    logger.info({ module: "server" }, "Telemetry shutdown successfully.");
  } catch (error) {
    logger.error(
      { module: "server", err: error },
      "Error occurred while shutting down telemetry.",
    );
    hadError = true;
  }

  process.exit(hadError ? Math.max(exitCode, 1) : exitCode);
};

process.on("SIGINT", () => {
  void shutdown("SIGINT", 0);
});
process.on("SIGTERM", () => {
  void shutdown("SIGTERM", 0);
});

/**
 * Bootstraps dependencies and starts the event consumers.
 */
const startWorker = async () => {
  logger.info({ module: "server" }, "Bootstrapping worker dependencies...");

  // Sequential initialization of core network clients
  await withTimeout("Redis connect", initRedis());
  await withTimeout("Kafka connect", initKafka());

  logger.info(
    { module: "server" },
    "All connection channels established successfully.",
  );

  // Import container dynamically to guarantee initialized network dependencies
  const { NotificationContainer } = await import("./container/index.js");
  const container = NotificationContainer.getInstance();
  await container.start();
  isContainerInitialized = true;

  logger.info(
    { module: "server" },
    `Notification Service worker running successfully in ${env.NODE_ENV} mode.`,
  );
};

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason) => {
  logger.error(
    { module: "server", err: reason },
    "Unhandled Promise Rejection detected. Shutting down worker...",
  );
  void shutdown("SIGTERM", 1);
});

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  logger.error(
    { module: "server", err: error },
    "Uncaught Exception detected. Shutting down worker...",
  );
  void shutdown("SIGTERM", 1);
});

try {
  await startWorker();
} catch (error) {
  logger.error(
    { module: "server", err: error },
    "Failed to start notification worker.",
  );
  await shutdown("SIGTERM", 1);
}
