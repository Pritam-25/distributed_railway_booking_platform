import {
  ServerError,
  Status,
  type CallContext,
  type ServerMiddlewareCall,
} from "nice-grpc";

/**
 * Creates a nice-grpc server middleware for internal service-to-service Bearer authentication.
 * Checks context.metadata for `authorization: Bearer <expectedToken>`.
 *
 * @param expectedToken - The secret token required for authentication.
 * @returns A nice-grpc ServerMiddleware function.
 */
export function createInternalAuthServerMiddleware(expectedToken: string) {
  return async function* internalAuthServerMiddleware<Request, Response>(
    call: ServerMiddlewareCall<Request, Response>,
    context: CallContext,
  ) {
    // Kubernetes native gRPC probes and standard gRPC health clients invoke
    // grpc.health.v1.Health methods without authorization headers.
    if (call.method.path.startsWith("/grpc.health.v1.Health/")) {
      return yield* call.next(call.request, context);
    }

    const authorization = context.metadata.get("authorization");

    if (!authorization?.startsWith("Bearer ")) {
      throw new ServerError(
        Status.UNAUTHENTICATED,
        "Missing or malformed authorization metadata header.",
      );
    }

    const token = authorization.slice("Bearer ".length).trim();

    if (token !== expectedToken) {
      throw new ServerError(
        Status.UNAUTHENTICATED,
        "Invalid internal service authentication token.",
      );
    }

    return yield* call.next(call.request, context);
  };
}
