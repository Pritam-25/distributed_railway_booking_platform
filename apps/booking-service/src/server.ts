/**
 * ## module/server
 *
 * `booking-service` bootstrap. Registers user-facing error messages,
 * wires network dependencies, then delegates full HTTP lifecycle management
 * to `startServer` from `@irctc/http`.
 *
 * Background tasks (Kafka consumers, outbox publisher) are managed via
 * `BookingContainer` in the `afterListen` and `beforeShutdown` hooks.
 *
 * `startServer` owns:
 * - HTTP bind + signal handlers
 * - Graceful shutdown with `isShuttingDown` idempotency
 * - Telemetry shutdown (always the last step)
 */

import {
  env,
  initPrisma,
  disconnectPrisma,
  initRedis,
  disconnectRedis,
  initKafka,
  disconnectKafka,
} from "@config";
import { logger } from "@irctc/logger";
import { registerErrorMessages } from "@irctc/errors";
import { withTimeout, startServer, runBootstrap } from "@irctc/http";
import { ERROR_MESSAGES } from "@utils/errors";
import { closeInventoryGrpcChannel } from "@grpc";

// 1. Register user-facing error messages with the @irctc/errors registry.
registerErrorMessages(ERROR_MESSAGES);

await runBootstrap({
  bootstrap: async () => {
    // 2. Connect network dependencies BEFORE importing container and app.js.
    await withTimeout("Prisma connect", initPrisma());
    await withTimeout("Redis connect", initRedis());
    await withTimeout("Kafka connect", initKafka());

    logger.info(
      { module: "server" },
      "All dependencies connected successfully.",
    );

    // 3. Dynamically import container and app.js after dependencies are ready.
    const { BookingContainer } = await import("@container");
    const { default: app } = await import("./app.js");

    await startServer({
      app,
      port: env.PORT,
      environment: env.NODE_ENV,
      serviceName: env.SERVICE_NAME,
      afterListen: async () => {
        logger.info(
          { module: "server" },
          "Starting booking event consumers and outbox publisher worker...",
        );
        const container = BookingContainer.getInstance();
        await container.start();
      },
      beforeShutdown: async () => {
        logger.info(
          { module: "server" },
          "Stopping booking event consumers and outbox publisher worker...",
        );
        await BookingContainer.getInstance().disconnect();
      },
      afterShutdown: async () => {
        await withTimeout(
          "gRPC client channel close",
          closeInventoryGrpcChannel(),
        );
        await withTimeout("Kafka disconnect", disconnectKafka());
        await withTimeout("Redis disconnect", disconnectRedis());
        await withTimeout("Prisma disconnect", disconnectPrisma());
      },
    });
  },
  onFailure: async () => {
    await withTimeout(
      "gRPC client channel close",
      closeInventoryGrpcChannel(),
    ).catch(() => {});
    await withTimeout("Kafka disconnect", disconnectKafka()).catch(() => {});
    await withTimeout("Redis disconnect", disconnectRedis()).catch(() => {});
    await withTimeout("Prisma disconnect", disconnectPrisma()).catch(() => {});
  },
});
