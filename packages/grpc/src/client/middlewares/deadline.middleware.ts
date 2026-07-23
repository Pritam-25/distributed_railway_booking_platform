import { type ClientMiddlewareCall, type CallOptions } from "nice-grpc";

export interface DeadlineMiddlewareOptions {
  defaultTimeoutMs?: number;
}

/**
 * Creates a client deadline middleware enforcing a default timeout if none is provided.
 */
export function createDeadlineMiddleware(options?: DeadlineMiddlewareOptions) {
  const timeoutMs = options?.defaultTimeoutMs ?? 3000;

  return async function* deadlineMiddleware<Request, Response>(
    call: ClientMiddlewareCall<Request, Response>,
    callOptions: CallOptions,
  ) {
    const signal = callOptions.signal ?? AbortSignal.timeout(timeoutMs);

    return yield* call.next(call.request, {
      ...callOptions,
      signal,
    });
  };
}
