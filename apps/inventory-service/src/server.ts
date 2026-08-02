/**
 * ## module/server
 *
 * `inventory-service` bootstrap. Registers the user-facing error messages,
 * wires dependencies, then delegates the full lifecycle to
 * `startServer` from `@irctc/http`.
 *
 * Service-specific glue (Kafka consumer start/stop) is owned by
 * `InventoryContainer.start()` / `InventoryContainer.disconnect()` and is
 * driven from the `afterListen` / `beforeShutdown` hooks. The framework
 * does not know about it.
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
  initRedis,
  disconnectRedis,
} from "@config";
import { logger } from "@irctc/logger";
import { registerErrorMessages } from "@irctc/errors";
import { withTimeout, startServer, runBootstrap } from "@irctc/http";
import { ERROR_MESSAGES } from "@utils/errors";

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

    // 3. Import container and app.js.
    const { InventoryContainer } =
      await import("./container/inventory.container.js");
    const { default: app } = await import("./app.js");

    await startServer({
      app,
      port: env.PORT,
      environment: env.NODE_ENV,
      serviceName: env.SERVICE_NAME,
      afterListen: async () => {
        logger.info(
          { module: "server" },
          "Starting inventory event consumers...",
        );
        await InventoryContainer.getInstance().start();
      },
      beforeShutdown: async () => {
        logger.info(
          { module: "server" },
          "Stopping inventory event consumers...",
        );
        await InventoryContainer.getInstance().disconnect();
      },
      afterShutdown: async () => {
        await withTimeout("Kafka disconnect", disconnectKafka());
        await withTimeout("Redis disconnect", disconnectRedis());
        await withTimeout("Prisma disconnect", disconnectPrisma());
      },
    });
  },
  onFailure: async () => {
    await withTimeout("Kafka disconnect", disconnectKafka()).catch(() => {});
    await withTimeout("Redis disconnect", disconnectRedis()).catch(() => {});
    await withTimeout("Prisma disconnect", disconnectPrisma()).catch(() => {});
  },
});
