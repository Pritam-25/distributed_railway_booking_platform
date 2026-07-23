import { type ServerMiddlewareCall, type CallContext } from "nice-grpc";
import { mapToGrpcError } from "../../errors/mapper.js";

/**
 * Server-side error handling middleware for nice-grpc.
 * Catches domain errors (ApiError) and rethrows canonical gRPC ServerErrors.
 */
export async function* serverErrorMiddleware<Request, Response>(
  call: ServerMiddlewareCall<Request, Response>,
  context: CallContext,
) {
  try {
    return yield* call.next(call.request, context);
  } catch (error) {
    throw mapToGrpcError(error);
  }
}
