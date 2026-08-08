/**
 * ## module/server
 *
 * `admin-service` bootstrap. Registers the user-facing error messages,
 * wires dependencies, then delegates the full lifecycle to
 * `startServer` from `@irctc/http`.
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
  initKafka,
  disconnectKafka,
} from "@config";
import { logger } from "@irctc/logger";
import { registerErrorMessages } from "@irctc/errors";
import { withTimeout, startServer, runBootstrap } from "@irctc/http";
import { ERROR_MESSAGES } from "@utils/errors";

// 1. Register user-facing error messages with the @irctc/errors registry.
registerErrorMessages(ERROR_MESSAGES);

await runBootstrap({
  bootstrap: async () => {
    // 2. Connect network dependencies BEFORE importing app.js / adminContainer.
    await withTimeout("Prisma connect", initPrisma());
    await withTimeout("Kafka connect", initKafka());
    logger.info(
      { module: "server" },
      "All dependencies connected successfully.",
    );

    // 3. Dynamically import container and app.js after dependencies are ready.
    const { AdminContainer } = await import("@container");
    const { default: app } = await import("./app.js");

    await startServer({
      app,
      port: env.PORT,
      environment: env.NODE_ENV,
      serviceName: env.SERVICE_NAME,
      afterListen: async () => {
        logger.info(
          { module: "server" },
          "Starting admin outbox publisher worker...",
        );
        AdminContainer.getInstance().start();
      },
      beforeShutdown: async () => {
        logger.info(
          { module: "server" },
          "Stopping admin outbox publisher worker...",
        );
        await AdminContainer.getInstance().disconnect();
      },
      afterShutdown: async () => {
        await withTimeout("Kafka disconnect", disconnectKafka());
        await withTimeout("Prisma disconnect", disconnectPrisma());
      },
    });
  },
  onFailure: async () => {
    await withTimeout("Kafka disconnect", disconnectKafka()).catch(() => {});
    await withTimeout("Prisma disconnect", disconnectPrisma()).catch(() => {});
  },
});
