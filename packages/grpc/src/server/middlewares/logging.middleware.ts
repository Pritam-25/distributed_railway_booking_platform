import {
  type ServerMiddlewareCall,
  type CallContext,
  ServerError,
  Status,
} from "nice-grpc";
import { logger } from "@irctc/logger";

/**
 * Server-side logging middleware for nice-grpc.
 */
export async function* serverLoggingMiddleware<Request, Response>(
  call: ServerMiddlewareCall<Request, Response>,
  context: CallContext,
) {
  const path = call.method.path;
  logger.info(
    { module: "grpc-server", path },
    `gRPC server request started: ${path}`,
  );

  try {
    const result = yield* call.next(call.request, context);
    logger.info(
      { module: "grpc-server", path },
      `gRPC server request finished: ${path}`,
    );
    return result;
  } catch (error) {
    if (error instanceof ServerError) {
      logger.error(
        {
          module: "grpc-server",
          path,
          code: Status[error.code],
          details: error.details,
        },
        `gRPC server request failed: ${path} [${Status[error.code]}]`,
      );
    } else {
      logger.error(
        { module: "grpc-server", path, err: error },
        `gRPC server request unhandled failure: ${path}`,
      );
    }
    throw error;
  }
}
