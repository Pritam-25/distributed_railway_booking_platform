import {
  env,
  initKafka,
  disconnectKafka,
  disconnectRedis,
  initRedis,
  disconnectElasticsearch,
  initElasticsearch,
} from "@config";
import { logger } from "@irctc/logger";
import type { Server } from "node:http";
import { registerErrorMessages } from "@irctc/errors";
import { ERROR_MESSAGES } from "@utils/errors";
import { shutdownTelemetry } from "@irctc/telemetry";

const PORT = env.PORT;

let isShuttingDown = false;
let server: Server | undefined;
let isContainerInitialized = false;

/**
 * ## withTimeout
 *
 * Bounded `Promise.race` wrapper that rejects a step after `ms` if it does
 * not complete in time. Used to wrap every startup and shutdown step so a
 * hung dependency cannot keep the pod alive past the k8s grace window.
 *
 * @param label - Diagnostic label used in the timeout error message.
 * @param op - Promise to await.
 * @param ms - Timeout in milliseconds (default 5000).
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
 * ## shutdown
 *
 * Graceful shutdown sequence for SIGINT and SIGTERM. Idempotent — a second
 * signal during shutdown is a no-op.
 *
 * ### Steps
 * 1. Stop accepting new HTTP traffic (server.close drains in-flight requests).
 * 2. Stop Kafka consumers (via the container).
 * 3. Disconnect Kafka, Redis, Elasticsearch, telemetry in that order.
 * 4. `process.exit` with the requested code, upgraded to `1` if any step failed.
 *
 * ### Invariants
 * - Consumers must stop before the Kafka producer is disconnected, otherwise in-flight messages lose their pipeline.
 * - Every step's failure is logged but never blocks the next step.
 *
 * @param signal - Signal that triggered the shutdown (for logs only).
 * @param exitCode - Process exit code when no error occurred.
 */
const shutdown = async (signal: NodeJS.Signals, exitCode = 0) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  let hadError = false;
  logger.info(
    { module: "server" },
    `Received ${signal}, shutting down gracefully...`,
  );

  // 1. Drain HTTP
  if (server) {
    try {
      await withTimeout(
        "HTTP server close",
        new Promise<void>((resolve, reject) => {
          server!.close((err) => {
            if (err) return reject(err);
            resolve();
          });
        }),
      );
      logger.info({ module: "server" }, "HTTP server closed.");
    } catch (error) {
      logger.error(
        { module: "server", err: error },
        "Error occurred while closing HTTP server.",
      );
    }
  }

  // 2. Stop consumers before the producer disconnects
  if (isContainerInitialized) {
    try {
      const { SearchContainer } = await import("./container/index.js");
      await withTimeout(
        "Consumers stop",
        SearchContainer.getInstance().disconnect(),
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

  // 3. Disconnect dependencies in dependency order

  // 3a. Disconnect Kafka
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

  // 3b. Disconnect Redis
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

  // 3c. Disconnect Elasticsearch
  try {
    await withTimeout("Elasticsearch disconnect", disconnectElasticsearch());
    logger.info({ module: "server" }, "Elasticsearch connection closed.");
  } catch (error) {
    logger.error(
      { module: "server", err: error },
      "Error occurred while disconnecting Elasticsearch.",
    );
    hadError = true;
  }

  // 3d. Shutdown telemetry
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

  // 4. Exit process with the requested code, upgraded to `1` if any step failed
  process.exit(hadError ? Math.max(exitCode, 1) : exitCode);
};

process.on("SIGINT", () => {
  void shutdown("SIGINT", 0);
});
process.on("SIGTERM", () => {
  void shutdown("SIGTERM", 0);
});

/**
 * ## startServer
 *
 * Bootstraps dependencies, wires the container, and binds the HTTP port.
 *
 * ### Steps
 * 1. Register error messages with the global registry.
 * 2. Connect Elasticsearch → Redis → Kafka in that order.
 * 3. Start the container (ensureIndex + subscribe consumers).
 * 4. Bind the HTTP port last.
 *
 * ### Invariants
 * - The HTTP port binds after the consumers start so partition assignment is negotiated against a bound listener.
 *
 * ### Errors
 * - Rethrows if any init step fails; the outer catch calls `shutdown` so the process exits cleanly.
 */
const startServer = async () => {
  // 1. Error registry must be populated before any handler can throw
  registerErrorMessages(ERROR_MESSAGES);

  logger.info({ module: "server" }, "Bootstrapping dependencies...");

  // 2. Dependency order — Elasticsearch first because it's the slowest,
  // then Redis (idempotency), then Kafka (consumers + producer)
  await withTimeout("Elasticsearch connect", initElasticsearch());
  await withTimeout("Redis connect", initRedis());
  await withTimeout("Kafka connect", initKafka());

  logger.info({ module: "server" }, "All dependencies connected successfully.");

  // 3. Container must be created AFTER initKafka/initRedis/initElasticsearch
  const { SearchContainer } = await import("./container/index.js");
  const container = SearchContainer.getInstance();
  await container.start();
  isContainerInitialized = true;

  // 4. Bind the port last so it is up before any consumer partition assignment
  const { default: app } = await import("./app.js");

  server = app.listen(PORT, () => {
    logger.info(
      { module: "server" },
      `server listening at http://localhost:${PORT} (${env.NODE_ENV})`,
    );
  });

  return server;
};

// Catch unhandled rejections and uncaught exceptions
// to avoid the process being in an inconsistent state.
// Shutdown is idempotent so a second signal is a no-op.
process.on("unhandledRejection", (reason) => {
  logger.error(
    { module: "server", err: reason },
    "Unhandled Promise Rejection detected. Shutting down...",
  );
  void shutdown("SIGTERM", 1);
});

process.on("uncaughtException", (error) => {
  logger.error(
    { module: "server", err: error },
    "Uncaught Exception detected. Shutting down...",
  );
  void shutdown("SIGTERM", 1);
});

// start the server and catch any errors during startup so the process exits cleanly
try {
  await startServer();
} catch (error) {
  logger.error({ module: "server", err: error }, "Failed to start server.");
  await shutdown("SIGTERM", 1);
}
