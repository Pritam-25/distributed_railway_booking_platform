import { createGrpcServer, type Server } from "@irctc/grpc";
import { PaymentServiceDefinition } from "@irctc/contracts";
import { logger } from "@irctc/logger";
import { env } from "@config";
import { PaymentGrpcHandler } from "./payment.handler.js";

let grpcServer: Server | undefined;

/**
 * Boots the gRPC server using nice-grpc and binds the payment handler.
 * Uses centralized @irctc/grpc server factory with logging and domain error translation.
 *
 * @param port - TCP port to bind the gRPC server.
 * @param handler - PaymentGrpcHandler instance.
 * @returns A promise that resolves when the gRPC server is active.
 */
export const startGrpcServer = async (
  port: number,
  handler: PaymentGrpcHandler,
): Promise<Server> => {
  grpcServer = createGrpcServer({
    auth: {
      mode: "bearer",
      expectedToken: env.GRPC_INTERNAL_AUTH_TOKEN,
    },
  });

  grpcServer.add(PaymentServiceDefinition, handler);

  const address = `0.0.0.0:${port}`;
  await grpcServer.listen(address);

  logger.info(
    { module: "grpc-server", port },
    `Payment gRPC server listening at ${address}`,
  );

  return grpcServer;
};

/**
 * Gracefully terminates the active gRPC server.
 */
export const stopGrpcServer = async (): Promise<void> => {
  if (grpcServer) {
    logger.info({ module: "grpc-server" }, "Stopping gRPC server...");
    await grpcServer.shutdown();
    grpcServer = undefined;
    logger.info({ module: "grpc-server" }, "gRPC server stopped.");
  }
};
