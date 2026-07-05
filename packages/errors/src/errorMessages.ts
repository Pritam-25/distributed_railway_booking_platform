/**
 * Error messages for API.
 */
import { ERROR_CODES, type ErrorCode } from "./errorCodes.js";

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  [ERROR_CODES.INTERNAL_ERROR]: "Internal server error.",
  [ERROR_CODES.CONFLICT]: "Conflict.",
  [ERROR_CODES.NOT_FOUND]: "Not found.",
  [ERROR_CODES.BAD_REQUEST]: "Bad request.",
  [ERROR_CODES.UNAUTHORIZED]: "Unauthorized.",
  [ERROR_CODES.FORBIDDEN]: "Forbidden.",
  [ERROR_CODES.VALIDATION_ERROR]: "Validation error.",
  [ERROR_CODES.INVALID_INPUT]: "Invalid input.",
  [ERROR_CODES.RATE_LIMIT_EXCEEDED]: "Rate limit exceeded.",
  [ERROR_CODES.SERVICE_UNAVAILABLE]: "Service unavailable.",
  [ERROR_CODES.KAFKA_PUBLISH_FAILED]: "Kafka publish failed.",
};
