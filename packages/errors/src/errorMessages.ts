/**
 * Error messages for API.
 */
import { COMMON_ERROR_CODES, type CommonErrorCode } from "./errorCodes.js";

export const COMMON_ERROR_MESSAGES: Record<CommonErrorCode, string> = {
  [COMMON_ERROR_CODES.INTERNAL_ERROR]: "Internal server error.",
  [COMMON_ERROR_CODES.NOT_FOUND]: "Resource not found.",
  [COMMON_ERROR_CODES.CONFLICT]: "Resource conflict.",
  [COMMON_ERROR_CODES.UNAUTHORIZED]: "Authentication required.",
  [COMMON_ERROR_CODES.FORBIDDEN]: "Access denied.",
  [COMMON_ERROR_CODES.INVALID_INPUT]: "Invalid request input.",
  [COMMON_ERROR_CODES.RATE_LIMIT_EXCEEDED]: "Rate limit exceeded.",
  [COMMON_ERROR_CODES.SERVICE_UNAVAILABLE]: "Service unavailable.",
  [COMMON_ERROR_CODES.KAFKA_PUBLISH_FAILED]: "Failed to publish Kafka event.",
};
