/**
 * ## module/server
 *
 * `search-service` bootstrap. Registers the user-facing error messages,
 * wires dependencies, then delegates the full lifecycle to
 * `startServer` from `@irctc/http`.
 *
 * Service-specific glue (Kafka consumer start/stop + Elasticsearch index
 * ensure) is owned by `SearchContainer.start()` and runs in
 * `afterListen`. The framework does not know about it.
 *
 * `startServer` owns:
 * - HTTP bind + signal handlers
 * - Graceful shutdown with `isShuttingDown` idempotency
 * - Telemetry shutdown (always the last step)
 */

import {
  env,
  initKafka,
  disconnectKafka,
  initRedis,
  disconnectRedis,
  initElasticsearch,
  disconnectElasticsearch,
} from "@config";
import { logger } from "@irctc/logger";
import { registerErrorMessages } from "@irctc/errors";
import { withTimeout, startServer } from "@irctc/http";
import { ERROR_MESSAGES } from "@utils/errors";

// 1. Register user-facing error messages with the @irctc/errors registry.
registerErrorMessages(ERROR_MESSAGES);

// 2. Connect network dependencies BEFORE importing container and app.js.

await withTimeout("Elasticsearch connect", initElasticsearch());
await withTimeout("Redis connect", initRedis());
await withTimeout("Kafka connect", initKafka());
logger.info({ module: "server" }, "All dependencies connected successfully.");

// 3. Import SearchContainer and initialize indices/consumers BEFORE listening.
const { SearchContainer } = await import("./container/search.container.js");
await SearchContainer.getInstance().start();

// 4. Import app.js after dependencies and container are ready.
const { default: app } = await import("./app.js");

await startServer({
  app,
  port: env.PORT,
  environment: env.NODE_ENV,
  serviceName: env.SERVICE_NAME,
  beforeShutdown: async () => {
    await SearchContainer.getInstance().disconnect();
  },
  afterShutdown: async () => {
    await withTimeout("Kafka disconnect", disconnectKafka());
    await withTimeout("Redis disconnect", disconnectRedis());
    await withTimeout("Elasticsearch disconnect", disconnectElasticsearch());
  },
}).catch((err) => {
  logger.error({ module: "server", err }, "Failed to start server.");
  process.exit(1);
});
