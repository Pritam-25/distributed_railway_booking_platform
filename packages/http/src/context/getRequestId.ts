import { getRequestContext } from "./requestContext.js";

/**
 * Retrieves request id from the request context.
 * @returns Request id.
 */
export const getRequestId = (): string | undefined =>
  getRequestContext()?.requestId;
