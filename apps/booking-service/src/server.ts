/**
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
import {
  startServer,
  runBootstrap,
  runSteps,
  runShutdownSteps,
  type BoundedStep,
} from "@irctc/http";
import { ERROR_MESSAGES } from "@utils/errors";
import { closeInventoryGrpcChannel, closePaymentGrpcChannel } from "@grpc";

// 1. Register user-facing error messages with the @irctc/errors registry.
registerErrorMessages(ERROR_MESSAGES);

const shutdownSteps: BoundedStep[] = [
  ["Inventory gRPC client channel close", closeInventoryGrpcChannel],
  ["Payment gRPC client channel close", closePaymentGrpcChannel],
  ["Kafka disconnect", disconnectKafka],
  ["Redis disconnect", disconnectRedis],
  ["Prisma disconnect", disconnectPrisma],
];

await runBootstrap({
  bootstrap: async () => {
    // 2. Connect network dependencies BEFORE importing container and app.js.
    await runSteps([
      ["Prisma connect", initPrisma],
      ["Redis connect", initRedis],
      ["Kafka connect", initKafka],
    ]);

    logger.info(
      { module: "server" },
      "External infrastructure connected successfully.",
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
        const container = BookingContainer.getInstance();
        await container.start();
      },
      beforeShutdown: async () => {
        await BookingContainer.getInstance().disconnect();
      },
      afterShutdown: () => runShutdownSteps(shutdownSteps),
    });
  },
  onFailure: () => runShutdownSteps(shutdownSteps, true),
});
