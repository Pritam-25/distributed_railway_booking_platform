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
import { closeBookingGrpcChannel, getBookingGrpcClient } from "@grpc";

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

    // 3. Eagerly initialize gRPC client on boot
    getBookingGrpcClient();

    // 4. Dynamically import container and app.js after dependencies are ready.
    const { PaymentContainer } = await import("@container");
    const { default: app } = await import("./app.js");

    await startServer({
      app,
      port: env.PORT,
      environment: env.NODE_ENV,
      serviceName: env.SERVICE_NAME,
      afterListen: async () => {
        logger.info(
          { module: "server" },
          "Starting payment event consumers...",
        );
        const container = PaymentContainer.getInstance();
        await container.start();
      },
      beforeShutdown: async () => {
        logger.info(
          { module: "server" },
          "Stopping payment event consumers...",
        );
        await PaymentContainer.getInstance().disconnect();
      },
      afterShutdown: async () => {
        await withTimeout(
          "gRPC client channel close",
          closeBookingGrpcChannel(),
        );
        await withTimeout("Kafka disconnect", disconnectKafka());
        await withTimeout("Redis disconnect", disconnectRedis());
        await withTimeout("Prisma disconnect", disconnectPrisma());
      },
    });
  },
  onFailure: async () => {
    await withTimeout(
      "gRPC client channel close",
      closeBookingGrpcChannel(),
    ).catch(() => {});
    await withTimeout("Kafka disconnect", disconnectKafka()).catch(() => {});
    await withTimeout("Redis disconnect", disconnectRedis()).catch(() => {});
    await withTimeout("Prisma disconnect", disconnectPrisma()).catch(() => {});
  },
});
