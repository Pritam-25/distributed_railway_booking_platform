import { ERROR_CODES, type GatewayErrorCode } from "./errorCodes.js";

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
  ACCESS_TOKEN_MISSING: string;
} = {
  // Shared / Auth
  ACCESS_TOKEN_MISSING: "Token is invalid or expired",
  // Gateway-specific
  [ERROR_CODES.AUTH_REQUIRED]: "Authentication required.",
  [ERROR_CODES.GATEWAY_UPSTREAM_ERROR]:
    "Upstream service is unavailable. Please try again shortly.",
  [ERROR_CODES.GATEWAY_UPSTREAM_CIRCUIT_OPEN]:
    "Upstream service is temporarily unavailable. Please try again later.",
  [ERROR_CODES.METHOD_NOT_ALLOWED]: "HTTP method not allowed for this route.",
};
