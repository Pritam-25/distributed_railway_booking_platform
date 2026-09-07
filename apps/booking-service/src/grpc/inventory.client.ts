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
    const res = createGrpcClient(
      InventoryServiceDefinition,
      env.INVENTORY_GRPC_URL,
      {
        defaultTimeoutMs: 3000,
        auth: {
          mode: "bearer",
          token: env.GRPC_INTERNAL_AUTH_TOKEN,
        },
      },
    );

    channel = res.channel;
    client = res.client as unknown as InventoryServiceClient;

    logger.info(
      { module: "grpc-client" },
      `Inventory gRPC channel connected to http://${env.INVENTORY_GRPC_URL}`,
    );
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
