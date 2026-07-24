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
 * Returns a long-lived singleton instance of the Booking gRPC client.
 * Uses centralized @irctc/grpc client factory with deadlines & logging.
 */
export const getBookingGrpcClient = (): InventoryServiceClient => {
  if (!client) {
    logger.info(
      { module: "grpc-client" },
      `Connecting gRPC channel to http://${env.BOOKING_GRPC_URL}`,
    );

    const res = createGrpcClient(
      InventoryServiceDefinition,
      env.BOOKING_GRPC_URL,
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
export const closeBookingGrpcChannel = async (): Promise<void> => {
  if (channel) {
    logger.info({ module: "grpc-client" }, "Closing booking gRPC channel...");
    channel.close();
    channel = undefined;
    client = undefined;
    logger.info({ module: "grpc-client" }, "Booking gRPC channel closed.");
  }
};
