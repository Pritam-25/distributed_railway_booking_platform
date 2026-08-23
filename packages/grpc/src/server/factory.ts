import { createServer, type Server, type ServerMiddleware } from "nice-grpc";
import { serverLoggingMiddleware } from "./middlewares/logging.middleware.js";
import { serverErrorMiddleware } from "./middlewares/error.middleware.js";
import { createInternalAuthServerMiddleware } from "./middlewares/auth.middleware.js";

export type GrpcServerAuthOptions =
  { mode: "none" } | { mode: "bearer"; expectedToken: string };

export interface CreateGrpcServerOptions {
  /**
   * Authentication configuration for the gRPC server.
   * - `mode: "none"`: No authentication enforced.
   * - `mode: "bearer"`: Validates incoming `authorization: Bearer <expectedToken>` header.
   */
  auth?: GrpcServerAuthOptions;
  /**
   * Additional custom server middlewares to attach.
   */
  additionalMiddlewares?: ServerMiddleware[];
}

/**
 * Creates a pre-configured nice-grpc Server loaded with standard logging,
 * domain error translation, and optional authentication middlewares.
 *
 * @param options - Configuration options for server creation.
 * @returns A nice-grpc Server instance.
 */
export function createGrpcServer(options?: CreateGrpcServerOptions): Server {
  let server = createServer()
    .use(serverLoggingMiddleware)
    .use(serverErrorMiddleware);

  if (options?.auth?.mode === "bearer") {
    server = server.use(
      createInternalAuthServerMiddleware(options.auth.expectedToken),
    );
  }

  if (options?.additionalMiddlewares) {
    for (const mw of options.additionalMiddlewares) {
      server = server.use(mw);
    }
  }

  return server;
}
