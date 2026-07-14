import { GATEWAY_ERROR_CODES, type GatewayErrorCode } from "./errorCodes.js";

/**
 * Gateway-specific error messages, merged with the shared registry
 * from `@irctc/errors`. Registered at boot via
 * `registerErrorMessages(ERROR_MESSAGES)` in `server.ts` so the
 * shared error pipeline (`errorHandler` → `errorResponse`) can
 * render user-facing text.
 *
 * User-facing only. Do not log this map — log short reasons with
 * the matching `*_ERROR_CODES.*` key in a comment instead.
 */
export const ERROR_MESSAGES: Record<GatewayErrorCode, string> & {
  readonly ACCESS_TOKEN_MISSING: string;
  readonly ACCESS_TOKEN_INVALID: string;
  readonly ADMIN_ACCESS_TOKEN_MISSING: string;
  readonly ADMIN_ACCESS_TOKEN_INVALID: string;
} = {
  // Gateway-specific
  [GATEWAY_ERROR_CODES.GATEWAY_UPSTREAM_ERROR]:
    "Upstream service is unavailable. Please try again shortly.",
  [GATEWAY_ERROR_CODES.GATEWAY_UPSTREAM_CIRCUIT_OPEN]:
    "Upstream service is temporarily unavailable. Please try again later.",
  [GATEWAY_ERROR_CODES.METHOD_NOT_ALLOWED]:
    "HTTP method not allowed for this route.",
  // Auth-specific messages — kept here because they are user-facing
  ACCESS_TOKEN_MISSING: "Access token is missing",
  ACCESS_TOKEN_INVALID: "Access token is invalid or expired",
  ADMIN_ACCESS_TOKEN_MISSING: "Admin access token is missing",
  ADMIN_ACCESS_TOKEN_INVALID: "Invalid or expired admin access token",
};
