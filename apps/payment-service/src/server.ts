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
        logger.info(
          { module: "server" },
          "Starting payment outbox worker & gRPC server...",
        );

        const container = PaymentContainer.getInstance();
        container.start();

        await startGrpcServer(env.GRPC_PORT, container.paymentGrpcHandler);
      },
      beforeShutdown: async () => {
        logger.info(
          { module: "server" },
          "Stopping gRPC server & payment outbox worker...",
        );
        await withTimeout("gRPC server stop", stopGrpcServer());
        await PaymentContainer.getInstance().disconnect();
      },
      afterShutdown: async () => {
        await withTimeout("Kafka disconnect", disconnectKafka());
        await withTimeout("Redis disconnect", disconnectRedis());
        await withTimeout("Prisma disconnect", disconnectPrisma());
      },
    });
  },
  onFailure: async () => {
    const { stopGrpcServer } = await import("@grpc").catch(() => ({
      stopGrpcServer: async () => {},
    }));

    await withTimeout("gRPC server stop", stopGrpcServer()).catch(() => {});
    await withTimeout("Kafka disconnect", disconnectKafka()).catch(() => {});
    await withTimeout("Redis disconnect", disconnectRedis()).catch(() => {});
    await withTimeout("Prisma disconnect", disconnectPrisma()).catch(() => {});
  },
});
