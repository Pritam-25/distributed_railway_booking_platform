import {
  type ClientMiddlewareCall,
  type CallOptions,
  ClientError,
  Status,
} from "nice-grpc";
import { logger } from "@irctc/logger";

/**
 * Client-side outbound RPC logging middleware.
 */
export async function* clientLoggingMiddleware<Request, Response>(
  call: ClientMiddlewareCall<Request, Response>,
  options: CallOptions,
) {
  const method = call.method.path;
  logger.info(
    { module: "grpc-client", method },
    `gRPC outbound call started: ${method}`,
  );

  try {
    const result = yield* call.next(call.request, options);
    logger.info(
      { module: "grpc-client", method },
      `gRPC outbound call succeeded: ${method}`,
    );
    return result;
  } catch (error) {
    if (error instanceof ClientError) {
      logger.error(
        {
          module: "grpc-client",
          method,
          code: Status[error.code],
          details: error.details,
        },
        `gRPC outbound call failed: ${method} [${Status[error.code]}]`,
      );
    } else {
      logger.error(
        { module: "grpc-client", method, err: error },
        `gRPC outbound call unhandled failure: ${method}`,
      );
    }
    throw error;
  }
}
