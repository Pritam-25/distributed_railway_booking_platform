/**
 * `inventory-service` bootstrap for pure gRPC + Kafka architecture.
 *
 * Registers user-facing error messages, connects network dependencies,
 * starts inventory event consumers/publishers, and binds the gRPC server
 * (InventoryService + canonical grpc.health.v1.Health).
 *
 * Standard gRPC health checking (`grpc.health.v1.Health`) handles
 * Kubernetes liveness (`service: "liveness"`) and readiness (`service: "readiness"`) probes.
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
import { withTimeout, runBootstrap } from "@irctc/http";
import { ERROR_MESSAGES } from "@utils/errors";

// 1. Register user-facing error messages with the @irctc/errors registry.
registerErrorMessages(ERROR_MESSAGES);

await runBootstrap({
  bootstrap: async () => {
    // 2. Connect network dependencies BEFORE importing container and gRPC server.
    await withTimeout("Prisma connect", initPrisma());
    await withTimeout("Redis connect", initRedis());
    await withTimeout("Kafka connect", initKafka());

    logger.info(
      { module: "server" },
      "All dependencies connected successfully.",
    );

    // 3. Import container, gRPC server, and HealthChecker.
    const { InventoryContainer } = await import("@container");
    const { startGrpcServer, stopGrpcServer, HealthChecker } =
      await import("@grpc");

    // 4. Start inventory event consumers & outbox publisher worker.
    logger.info(
      { module: "server" },
      "Starting inventory event consumers and outbox publisher worker...",
    );
    const container = InventoryContainer.getInstance();
    await container.start();

    // 5. Start gRPC server on GRPC_PORT (e.g. 50051).
    await startGrpcServer(env.GRPC_PORT, container.inventoryGrpcHandler);

    logger.info(
      { module: "server" },
      "Inventory gRPC service is active and serving traffic.",
    );

    // 6. Graceful shutdown handler.
    let isShuttingDown = false;
    const handleShutdown = async (signal: string) => {
      if (isShuttingDown) return;
      isShuttingDown = true;

      logger.info(
        { module: "server", signal },
        `Received ${signal}. Marking health as NOT_SERVING and initiating graceful shutdown...`,
      );

      // Step A: Immediately mark HealthState as NOT_SERVING for k8s probes and callers.
      HealthChecker.getInstance().setShuttingDown(true);

      try {
        // Step B: Stop gRPC server (stop receiving new RPCs).
        await withTimeout("gRPC server stop", stopGrpcServer());

        // Step C: Stop event consumers and outbox workers.
        await container.disconnect();

        // Step D: Disconnect network resources cleanly.
        await withTimeout("Kafka disconnect", disconnectKafka());
        await withTimeout("Redis disconnect", disconnectRedis());
        await withTimeout("Prisma disconnect", disconnectPrisma());

        logger.info(
          { module: "server" },
          "Graceful shutdown completed successfully.",
        );
        process.exit(0);
      } catch (err) {
        logger.error(
          { module: "server", err },
          "Error during graceful shutdown",
        );
        process.exit(1);
      }
    };

    process.once("SIGINT", () => handleShutdown("SIGINT"));
    process.once("SIGTERM", () => handleShutdown("SIGTERM"));
  },
  onFailure: async () => {
    const { stopGrpcServer, HealthChecker } = await import("@grpc").catch(
      () => ({
        stopGrpcServer: async () => {},
        HealthChecker: { getInstance: () => ({ setShuttingDown: () => {} }) },
      }),
    );
    HealthChecker.getInstance().setShuttingDown(true);
    await withTimeout("gRPC server stop", stopGrpcServer()).catch(() => {});
    await withTimeout("Kafka disconnect", disconnectKafka()).catch(() => {});
    await withTimeout("Redis disconnect", disconnectRedis()).catch(() => {});
    await withTimeout("Prisma disconnect", disconnectPrisma()).catch(() => {});
  },
});
