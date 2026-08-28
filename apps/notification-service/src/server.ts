/**
 * `notification-service` worker bootstrap. The service has no HTTP port;
 * it only runs Kafka consumers. Lifecycle is delegated to `startServer`
 * in `"worker"` mode from `@irctc/http`.
 *
 * Service-specific glue (Kafka consumer start/stop) is owned by
 * `NotificationContainer.start()` and `NotificationContainer.disconnect()`
 * and is driven from `afterListen` / `beforeShutdown`. The framework
 * does not know about it.
 *
 * `startServer` owns:
 * - Signal handlers (SIGINT/SIGTERM/unhandledRejection/uncaughtException)
 * - Graceful shutdown with `isShuttingDown` idempotency
 * - Telemetry shutdown (always the last step)
 */

import {
  env,
  initKafka,
  disconnectKafka,
  initRedis,
  disconnectRedis,
} from "@config";
import { logger } from "@irctc/logger";
import {
  startServer,
  runBootstrap,
  runSteps,
  runShutdownSteps,
  type BoundedStep,
} from "@irctc/http";

const shutdownSteps: BoundedStep[] = [
  ["Kafka disconnect", disconnectKafka],
  ["Redis disconnect", disconnectRedis],
];

await runBootstrap({
  bootstrap: async () => {
    // 1. Connect worker network dependencies BEFORE importing container.
    logger.info({ module: "server" }, "Bootstrapping worker dependencies...");
    await runSteps([
      ["Redis connect", initRedis],
      ["Kafka connect", initKafka],
    ]);
    logger.info(
      { module: "server" },
      "External infrastructure connected successfully.",
    );

    // 2. Import container and start event consumers via afterListen hook.
    const { NotificationContainer } =
      await import("./container/notification.container.js");

    await startServer({
      serviceName: env.SERVICE_NAME,
      environment: env.NODE_ENV,
      mode: "worker",
      afterListen: async () => {
        await NotificationContainer.getInstance().start();
        logger.info(
          { module: "server" },
          `Notification Service worker running successfully in (${env.NODE_ENV}) mode.`,
        );
      },
      beforeShutdown: async () => {
        await NotificationContainer.getInstance().disconnect();
      },
      afterShutdown: () => runShutdownSteps(shutdownSteps),
    });
  },
  onFailure: () => runShutdownSteps(shutdownSteps, true),
});
