import { Metadata, type ClientMiddleware } from "nice-grpc";

/**
 * Creates a nice-grpc client middleware that automatically injects
 * `authorization: Bearer <token>` metadata into outgoing client calls.
 *
 * @param token - Internal service token to send.
 * @returns A nice-grpc ClientMiddleware function.
 */
export function createInternalAuthClientMiddleware(
  token: string,
): ClientMiddleware {
  return async function* internalAuthClientMiddleware(call, options) {
    const metadata = new Metadata(options.metadata);

    if (!metadata.has("authorization")) {
      metadata.set("authorization", `Bearer ${token}`);
    }

    return yield* call.next(call.request, {
      ...options,
      metadata,
    });
  };
}
