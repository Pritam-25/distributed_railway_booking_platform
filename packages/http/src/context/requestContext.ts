import { AsyncLocalStorage } from "async_hooks";

/**
 * Request context object containing request-specific identifiers.
 */
type RequestContext = {
  requestId?: string;
};

const requestContextStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Runs a function with a request context.
 * @param context Request context.
 * @param fn Function to run.
 * @returns Result of the function.
 */
export const runWithRequestContext = <T>(
  context: RequestContext,
  fn: () => T,
): T => requestContextStorage.run(context, fn);

/**
 * Retrieves the request context.
 * @returns Request context.
 */
export const getRequestContext = (): RequestContext | undefined =>
  requestContextStorage.getStore();
