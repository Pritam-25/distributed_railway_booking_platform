import { createGrpcClient, type Channel } from "@irctc/grpc";
import {
  PaymentServiceDefinition,
  type PaymentServiceClient,
} from "@irctc/contracts";
import { logger } from "@irctc/logger";
import { env } from "@config";

let channel: Channel | undefined;
let client: PaymentServiceClient | undefined;

/**
 * Returns a long-lived singleton instance of the Payment gRPC client.
 * Uses centralized @irctc/grpc client factory with deadlines & logging.
 */
export const getPaymentGrpcClient = (): PaymentServiceClient => {
  if (!client) {
    logger.info(
      { module: "grpc-client" },
      `Connecting Payment gRPC channel to http://${env.PAYMENT_GRPC_URL}`,
    );

    const res = createGrpcClient(
      PaymentServiceDefinition,
      env.PAYMENT_GRPC_URL,
      {
        defaultTimeoutMs: 3000,
        auth: {
          mode: "bearer",
          token: env.GRPC_INTERNAL_AUTH_TOKEN,
        },
      },
    );

    channel = res.channel;
    client = res.client as unknown as PaymentServiceClient;
  }

  return client;
};

/**
 * Gracefully closes the gRPC channel connection.
 */
export const closePaymentGrpcChannel = async (): Promise<void> => {
  if (channel) {
    logger.info({ module: "grpc-client" }, "Closing payment gRPC channel...");
    channel.close();
    channel = undefined;
    client = undefined;
    logger.info({ module: "grpc-client" }, "Payment gRPC channel closed.");
  }
};
