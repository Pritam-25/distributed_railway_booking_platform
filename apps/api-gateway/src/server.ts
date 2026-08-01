/**
 * ## module/server
 *
 * `api-gateway` bootstrap. Registers the user-facing error messages,
 * wires dependencies, then delegates the full lifecycle to
 * `startServer` from `@irctc/http`.
 *
 * `startServer` owns:
 * - HTTP bind + signal handlers
 * - Graceful shutdown with `isShuttingDown` idempotency
 * - Telemetry shutdown (always the last step)
 */

import { env, initRedis, disconnectRedis } from "@config";
import { logger } from "@irctc/logger";
import { registerErrorMessages } from "@irctc/errors";
import { withTimeout, startServer, runBootstrap } from "@irctc/http";
import { ERROR_MESSAGES } from "@utils/error";

// 1. Register user-facing error messages with the @irctc/errors registry.
registerErrorMessages(ERROR_MESSAGES);

await runBootstrap({
  bootstrap: async () => {
    // 2. Connect Redis BEFORE importing app.js.
    await withTimeout("Redis connect", initRedis());
    logger.info(
      { module: "server" },
      "All dependencies connected successfully.",
    );

    // 3. Dynamically import app.js.
    const { default: app } = await import("./app.js");

    await startServer({
      app,
      port: env.PORT,
      environment: env.NODE_ENV,
      serviceName: env.SERVICE_NAME,
      afterShutdown: async () => {
        await withTimeout("Redis disconnect", disconnectRedis());
      },
    });
  },
  onFailure: async () => {
    await withTimeout("Redis disconnect", disconnectRedis()).catch(() => {});
  },
});
