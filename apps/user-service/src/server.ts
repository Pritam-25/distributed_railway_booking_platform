import {
  env,
  prisma,
  disconnectRedis,
  initRedis,
  initKafka,
  disconnectKafka,
} from "@config";
import { logger } from "@irctc/logger";
import type { Server } from "node:http";
import { registerErrorMessages } from "@irctc/errors";
import { ERROR_MESSAGES } from "@utils/errors";
import { shutdownTelemetry } from "@irctc/telemetry";

const PORT = env.PORT;

let isShuttingDown = false;
let server: Server | undefined;

/**
 * Graceful shutdown sequence to prevent data loss and ensure clean termination in K8s/Docker:
 * 1. Stop HTTP server (draining requests)
 * 2. Disconnect Kafka
 * 3. Disconnect Redis
 * 4. Disconnect Prisma
 * 5. Shutdown telemetry
 * 6. Exit process with appropriate exit code
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
    }
  }
  // 2. Disconnect Kafka
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
  // 3. Disconnect Redis
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
  // 4. Disconnect Prisma
  try {
    await withTimeout("Prisma disconnect", prisma.$disconnect());
    logger.info({ module: "server" }, "Prisma connection closed.");
  } catch (error) {
    logger.error(
      { module: "server", err: error },
      "Error occurred while disconnecting Prisma.",
    );
    hadError = true;
  }
  // 5. Shutdown telemetry
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
  registerErrorMessages(ERROR_MESSAGES);

  logger.info({ module: "server" }, "Bootstrapping dependencies...");

  // Sequential initialization of dependencies to ensure ordered readiness
  await withTimeout("Prisma connect", prisma.$connect());
  await withTimeout("Redis connect", initRedis());
  await withTimeout("Kafka connect", initKafka());

  logger.info({ module: "server" }, "All dependencies connected successfully.");

  const { default: app } = await import("./app.js");

  server = app.listen(PORT, () => {
    logger.info(
      { module: "server" },
      `server listening at http://localhost:${PORT} (${env.NODE_ENV})`,
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
  process.exit(1);
}
