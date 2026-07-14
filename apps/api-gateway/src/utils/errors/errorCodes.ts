/**
 * Gateway-specific error codes layered on top of the shared registry
 * in `@irctc/errors`. Keep this list small — only add codes that the
 * gateway itself produces (auth, header-injection, upstream mapping).
 * Domain errors belong in the upstream services, not here.
 */
export { ERROR_CODES } from "@irctc/errors";

export const GATEWAY_ERROR_CODES = {
  /** Proxy could not reach the upstream (502). */
  GATEWAY_UPSTREAM_ERROR: "GATEWAY_UPSTREAM_ERROR",
  /** Circuit breaker for the upstream is OPEN. */
  GATEWAY_UPSTREAM_CIRCUIT_OPEN: "GATEWAY_UPSTREAM_CIRCUIT_OPEN",
  /** Request method not allowed on the matched route. */
  METHOD_NOT_ALLOWED: "METHOD_NOT_ALLOWED",
} as const;

export type GatewayErrorCode =
  (typeof GATEWAY_ERROR_CODES)[keyof typeof GATEWAY_ERROR_CODES];
