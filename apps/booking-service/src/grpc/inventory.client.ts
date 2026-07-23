import { createGrpcClient, type Channel } from "@irctc/grpc";
import {
  InventoryServiceDefinition,
  type InventoryServiceClient,
} from "@irctc/contracts";
import { logger } from "@irctc/logger";
import { env } from "@config";

let channel: Channel | undefined;
let client: InventoryServiceClient | undefined;

/**
 * Returns a long-lived singleton instance of the Inventory gRPC client.
 * Uses centralized @irctc/grpc client factory with deadlines & logging.
 */
export const getInventoryGrpcClient = (): InventoryServiceClient => {
  if (!client) {
    logger.info(
      { module: "grpc-client", url: env.INVENTORY_GRPC_URL },
      `Connecting gRPC channel to ${env.INVENTORY_GRPC_URL}`,
    );

    const res = createGrpcClient(
      InventoryServiceDefinition,
      env.INVENTORY_GRPC_URL,
      { defaultTimeoutMs: 3000 },
    );

    channel = res.channel;
    client = res.client as unknown as InventoryServiceClient;
  }

  return client;
};

/**
 * Gracefully closes the gRPC channel connection.
 */
export const closeInventoryGrpcChannel = async (): Promise<void> => {
  if (channel) {
    logger.info({ module: "grpc-client" }, "Closing inventory gRPC channel...");
    channel.close();
    channel = undefined;
    client = undefined;
    logger.info({ module: "grpc-client" }, "Inventory gRPC channel closed.");
  }
};
