import { ApiError } from "./apiError.js";
import { ERROR_CODES, type ErrorCode } from "./errorCodes.js";
import { ERROR_MESSAGES } from "./errorMessages.js";
import { normalizePrismaError } from "./normalizePrismaError.js";
import { getMessageFromRegistry } from "./registry.js";

/**
 * Structure of a normalized API error object.
 */
type NormalizedError = {
  statusCode: number;
  errorCode: string;
  message: string;
  details?: unknown;
};

const ERROR_STATUS_MAP: Record<ErrorCode, number> = {
  [ERROR_CODES.INTERNAL_ERROR]: 500,
  [ERROR_CODES.CONFLICT]: 409,
  [ERROR_CODES.NOT_FOUND]: 404,
  [ERROR_CODES.BAD_REQUEST]: 400,
  [ERROR_CODES.UNAUTHORIZED]: 401,
  [ERROR_CODES.FORBIDDEN]: 403,
  [ERROR_CODES.VALIDATION_ERROR]: 400,
  [ERROR_CODES.INVALID_INPUT]: 400,
  [ERROR_CODES.RATE_LIMIT_EXCEEDED]: 429,
  [ERROR_CODES.SERVICE_UNAVAILABLE]: 503,
  [ERROR_CODES.KAFKA_PUBLISH_FAILED]: 500,
};

/**
 * Normalizes an error from a code.
 * @param code Error code.
 * @param message Error message.
 * @param details Error details.
 * @param overrideStatus Override status code.
 * @returns Normalized error.
 */
const normalizeFromCode = (
  code: string,
  message?: string,
  details?: unknown,
  overrideStatus?: number,
): NormalizedError => {
  const statusCode =
    overrideStatus ?? (ERROR_STATUS_MAP as Record<string, number>)[code] ?? 500;
  const fallbackMessage =
    getMessageFromRegistry(code) ??
    ERROR_MESSAGES[code as ErrorCode] ??
    ERROR_MESSAGES[ERROR_CODES.INTERNAL_ERROR];

  const resolvedMessage =
    !message || message === code ? fallbackMessage : message;

  return {
    statusCode,
    errorCode: code,
    message: resolvedMessage,
    details,
  };
};

/**
 * Normalizes an error into a NormalizedError object.
 * @param error The error to normalize.
 * @returns Normalized error object.
 */
export const normalizeError = (error: unknown): NormalizedError => {
  if (error instanceof ApiError) {
    return normalizeFromCode(
      error.code,
      error.message,
      error.details,
      error.statusCode,
    );
  }

  const prismaCode = normalizePrismaError(error);
  if (prismaCode) {
    return normalizeFromCode(prismaCode);
  }

  return normalizeFromCode(ERROR_CODES.INTERNAL_ERROR);
};
