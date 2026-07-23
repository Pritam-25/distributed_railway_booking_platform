import { env, disconnectRedis, initRedis } from "@config";
import { logger } from "@irctc/logger";
import { registerErrorMessages } from "@irctc/errors";
import type { Server } from "node:http";
import { shutdownTelemetry } from "@irctc/telemetry";
import { ERROR_MESSAGES } from "@utils";

const PORT = env.PORT;

let isShuttingDown = false;
let server: Server | undefined;

/**
 * Executes a promise-based operation with a maximum timeout threshold.
 *
 * @param label - Diagnostic label used in timeout error messages.
 * @param op    - The promise representing the async operation.
 * @param ms    - The timeout limit in milliseconds (default: 5000).
 * @returns A promise resolving to the operation result.
 * @throws {Error} If the timeout is reached before the operation completes.
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
 * Graceful shutdown sequence for the API gateway:
 * 1. Stop HTTP server (drain in-flight requests)
 * 2. Disconnect Redis
 * 3. Shutdown OpenTelemetry
 * 4. Exit process
 */
const shutdown = async (signal: NodeJS.Signals, exitCode = 0) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  let hadError = false;
  logger.info(
    { module: "server" },
    `Received ${signal}, shutting down gracefully...`,
  );

  // 1. Stop HTTP server (drain requests)
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
      hadError = true;
    }
  }

  // 2. Disconnect Redis
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

  // 3. Shutdown telemetry
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

const startServer = async () => {
  // 1. Register gateway-specific error messages so the shared
  //    errorHandler can render them via the @irctc/errors registry.
  registerErrorMessages(ERROR_MESSAGES);

  logger.info({ module: "server" }, "Bootstrapping dependencies...");

  // Redis is required for rate limiting
  await withTimeout("Redis connect", initRedis());

  logger.info({ module: "server" }, "All dependencies connected successfully.");

  const { default: app } = await import("./app.js");

  server = app.listen(PORT, () => {
    logger.info(
      { module: "server" },
      `API Gateway listening at http://localhost:${PORT} (${env.NODE_ENV})`,
    );
  });

  return server;
};

// Handle unhandled promise rejections
process.on("unhandledRejection", (reason) => {
  logger.error(
    { module: "server", err: reason },
    "Unhandled Promise Rejection detected. Shutting down...",
  );
  void shutdown("SIGTERM", 1);
});

// Handle uncaught exceptions
process.on("uncaughtException", (error) => {
  logger.error(
    { module: "server", err: error },
    "Uncaught Exception detected. Shutting down...",
  );
  void shutdown("SIGTERM", 1);
});

try {
  await startServer();
} catch (error) {
  logger.error({ module: "server", err: error }, "Failed to start server.");
  await shutdown("SIGTERM", 1);
}
