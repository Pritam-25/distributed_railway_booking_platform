import { createGrpcServer, type Server } from "@irctc/grpc";
import { InventoryServiceDefinition } from "@irctc/contracts";
import { logger } from "@irctc/logger";
import { inventoryHandler } from "./inventory.handler.js";

let grpcServer: Server | undefined;

/**
 * Boots the gRPC server using nice-grpc and binds the inventory handler.
 * Uses centralized @irctc/grpc server factory with logging and domain error translation.
 *
 * @param port - TCP port to bind the gRPC server.
 * @returns A promise that resolves when the gRPC server is active.
 */
export const startGrpcServer = async (port: number): Promise<Server> => {
  grpcServer = createGrpcServer();

  grpcServer.add(InventoryServiceDefinition, inventoryHandler);

  const address = `0.0.0.0:${port}`;
  await grpcServer.listen(address);

  logger.info(
    { module: "grpc-server", port },
    `gRPC server listening at ${address}`,
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
