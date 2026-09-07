/**
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
  ["Redis disconnect", disconnectRedis],
  ["Elasticsearch disconnect", disconnectElasticsearch],
];

await runBootstrap({
  bootstrap: async () => {
    // 2. Connect network dependencies BEFORE importing container and app.js.
    await runSteps([
      ["Elasticsearch connect", initElasticsearch],
      ["Redis connect", initRedis],
      ["Kafka connect", initKafka],
    ]);
    logger.info(
      { module: "server" },
      "External infrastructure connected successfully.",
    );

    // 3. Import SearchContainer and app.js.
    const { SearchContainer } = await import("./container/search.container.js");
    const { default: app } = await import("./app.js");

    await startServer({
      app,
      port: env.PORT,
      environment: env.NODE_ENV,
      serviceName: env.SERVICE_NAME,
      afterListen: async () => {
        await SearchContainer.getInstance().start();
      },
      beforeShutdown: async () => {
        await SearchContainer.getInstance().disconnect();
      },
      afterShutdown: () => runShutdownSteps(shutdownSteps),
    });
  },
  onFailure: () => runShutdownSteps(shutdownSteps, true),
});
