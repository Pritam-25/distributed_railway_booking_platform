/**
 * `payment-service` bootstrap. Registers user-facing error messages,
 * wires network dependencies, then delegates full HTTP lifecycle management
 * to `startServer` from `@irctc/http`.
 *
 * Background tasks (Outbox publisher & gRPC server) are managed via
 * `PaymentContainer` in the `afterListen` and `beforeShutdown` hooks.
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
  initRedis,
  disconnectRedis,
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
} from "@irctc/http";
import { ERROR_MESSAGES } from "@utils/errors";

// 1. Register user-facing error messages with the @irctc/errors registry.
registerErrorMessages(ERROR_MESSAGES);

await runBootstrap({
  bootstrap: async () => {
    // 2. Connect network dependencies BEFORE importing container and app.js.
    await runSteps([
      ["Prisma connect", initPrisma],
      ["Redis connect", initRedis],
      ["Kafka connect", initKafka],
    ]);

    logger.info(
      { module: "server" },
      "External infrastructure connected successfully.",
    );

    // 3. Dynamically import container, app.js, and gRPC tools after dependencies are ready.
    const { PaymentContainer } = await import("@container");
    const { default: app } = await import("./app.js");
    const { startGrpcServer, stopGrpcServer } = await import("@grpc");

    await startServer({
      app,
      port: env.PORT,
      environment: env.NODE_ENV,
      serviceName: env.SERVICE_NAME,
      afterListen: async () => {
        const container = PaymentContainer.getInstance();
        await container.start();

        await startGrpcServer(env.GRPC_PORT, container.paymentGrpcHandler);
      },
      beforeShutdown: async () => {
        await runShutdownSteps([["gRPC server stop", stopGrpcServer]]);
        await PaymentContainer.getInstance().disconnect();
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
