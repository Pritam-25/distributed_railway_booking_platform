/**
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
import {
  startServer,
  runBootstrap,
  runSteps,
  runShutdownSteps,
  type BoundedStep,
} from "@irctc/http";
import { ERROR_MESSAGES } from "@utils/errors";

// 1. Register user-facing error messages with the @irctc/errors registry.
registerErrorMessages(ERROR_MESSAGES);

const shutdownSteps: BoundedStep[] = [
  ["Kafka disconnect", disconnectKafka],
  ["Prisma disconnect", disconnectPrisma],
];

await runBootstrap({
  bootstrap: async () => {
    // 2. Connect network dependencies BEFORE importing app.js / adminContainer.
    await runSteps([
      ["Prisma connect", initPrisma],
      ["Kafka connect", initKafka],
    ]);
    logger.info(
      { module: "server" },
      "External infrastructure connected successfully.",
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
        AdminContainer.getInstance().start();
      },
      beforeShutdown: async () => {
        await AdminContainer.getInstance().disconnect();
      },
      afterShutdown: () => runShutdownSteps(shutdownSteps),
    });
  },
  onFailure: () => runShutdownSteps(shutdownSteps, true),
});
