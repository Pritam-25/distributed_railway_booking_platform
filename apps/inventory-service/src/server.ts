/**
 * `inventory-service` bootstrap for pure gRPC + Kafka architecture.
 *
 * Registers user-facing error messages, connects network dependencies,
 * starts inventory event consumers/publishers, and binds the gRPC server
 * (InventoryService + canonical grpc.health.v1.Health).
 *
 * Lifecycle management is delegated to `startServer` in `"grpc"` mode from `@irctc/http`.
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
import {
  startServer,
  runBootstrap,
  runSteps,
  runShutdownSteps,
} from "@irctc/http";
import { HealthChecker } from "@irctc/grpc";
import { ERROR_MESSAGES } from "@utils/errors";

// 1. Register user-facing error messages with the @irctc/errors registry.
registerErrorMessages(ERROR_MESSAGES);

await runBootstrap({
  bootstrap: async () => {
    // 2. Connect network dependencies BEFORE importing container and gRPC server.
    await runSteps([
      ["Prisma connect", initPrisma],
      ["Redis connect", initRedis],
      ["Kafka connect", initKafka],
    ]);

    logger.info(
      { module: "server" },
      "External infrastructure connected successfully.",
    );

    // 3. Import container and gRPC server.
    const { InventoryContainer } = await import("@container");
    const { startGrpcServer, stopGrpcServer } = await import("@grpc");

    await startServer({
      serviceName: env.SERVICE_NAME,
      environment: env.NODE_ENV,
      mode: "grpc",
      afterListen: async () => {
        const container = InventoryContainer.getInstance();
        await container.start();
        await startGrpcServer(env.GRPC_PORT, container.inventoryGrpcHandler);
      },
      beforeShutdown: async () => {
        HealthChecker.getInstance().setShuttingDown(true);
        await runShutdownSteps([["gRPC server stop", stopGrpcServer]]);
        await InventoryContainer.getInstance().disconnect();
      },
      afterShutdown: () =>
        runShutdownSteps([
          ["Kafka disconnect", disconnectKafka],
          ["Redis disconnect", disconnectRedis],
          ["Prisma disconnect", disconnectPrisma],
        ]),
    });
  },
  onFailure: async () => {
    HealthChecker.getInstance().setShuttingDown(true);
    const { stopGrpcServer } = await import("@grpc").catch(() => ({
      stopGrpcServer: async () => {},
    }));
    await runShutdownSteps(
      [
        ["gRPC server stop", stopGrpcServer],
        ["Kafka disconnect", disconnectKafka],
        ["Redis disconnect", disconnectRedis],
        ["Prisma disconnect", disconnectPrisma],
      ],
      true,
    );
  },
});
