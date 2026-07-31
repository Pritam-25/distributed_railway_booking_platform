/**
 * ## module/server
 *
 * `user-service` bootstrap. Registers the user-facing error messages,
 * wires dependencies, then delegates the full lifecycle to
 * `startServer` from `@irctc/http`.
 *
 * `startServer` owns:
 * - HTTP bind + signal handlers
 * - Graceful shutdown with `isShuttingDown` idempotency
 * - Telemetry shutdown (always the last step)
 *
 * @packageDocumentation
 */

import {
  env,
  prisma,
  disconnectRedis,
  initRedis,
  initKafka,
  disconnectKafka,
} from "@config";
import { logger } from "@irctc/logger";
import { registerErrorMessages } from "@irctc/errors";
import { withTimeout, startServer } from "@irctc/http";
import { ERROR_MESSAGES } from "@utils/errors";

// 1. Register user-facing error messages with the @irctc/errors registry.
registerErrorMessages(ERROR_MESSAGES);

// 2. Import app.ts dynamically so its middleware side effects only run once
//    the dependencies are ready.
const { default: app } = await import("./app.js");

await startServer({
  app,
  port: env.PORT,
  serviceName: env.SERVICE_NAME,
  beforeListen: async () => {
    logger.info({ module: "server" }, "Bootstrapping dependencies...");
    await withTimeout("Prisma connect", prisma.$connect());
    await withTimeout("Redis connect", initRedis());
    await withTimeout("Kafka connect", initKafka());
    logger.info(
      { module: "server" },
      "All dependencies connected successfully.",
    );
  },
  afterShutdown: async () => {
    await withTimeout("Kafka disconnect", disconnectKafka());
    await withTimeout("Redis disconnect", disconnectRedis());
    await withTimeout("Prisma disconnect", prisma.$disconnect());
  },
}).catch((err) => {
  logger.error({ module: "server", err }, "Failed to start server.");
  process.exit(1);
});
