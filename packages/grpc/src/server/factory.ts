import { createServer, type Server, type ServerMiddleware } from "nice-grpc";
import { serverLoggingMiddleware } from "./middlewares/logging.middleware.js";
import { serverErrorMiddleware } from "./middlewares/error.middleware.js";

export interface CreateGrpcServerOptions {
  /**
   * Additional custom server middlewares to attach.
   */
  additionalMiddlewares?: ServerMiddleware[];
}

/**
 * Creates a pre-configured nice-grpc Server loaded with standard logging
 * and domain-to-gRPC error translation middlewares.
 *
 * @param options - Configuration options for server creation.
 * @returns A nice-grpc Server instance.
 */
export function createGrpcServer(options?: CreateGrpcServerOptions): Server {
  let server = createServer()
    .use(serverErrorMiddleware)
    .use(serverLoggingMiddleware);

  if (options?.additionalMiddlewares) {
    for (const mw of options.additionalMiddlewares) {
      server = server.use(mw);
    }
  }

  return server;
}
