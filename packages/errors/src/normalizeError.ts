import { ApiError } from "./apiError.js";
import { COMMON_ERROR_CODES, type CommonErrorCode } from "./errorCodes.js";
import { COMMON_ERROR_MESSAGES } from "./errorMessages.js";
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

const ERROR_STATUS_MAP: Record<CommonErrorCode, number> = {
  [COMMON_ERROR_CODES.INTERNAL_ERROR]: 500,
  [COMMON_ERROR_CODES.CONFLICT]: 409,
  [COMMON_ERROR_CODES.NOT_FOUND]: 404,
  [COMMON_ERROR_CODES.UNAUTHORIZED]: 401,
  [COMMON_ERROR_CODES.FORBIDDEN]: 403,
  [COMMON_ERROR_CODES.INVALID_INPUT]: 400,
  [COMMON_ERROR_CODES.RATE_LIMIT_EXCEEDED]: 429,
  [COMMON_ERROR_CODES.SERVICE_UNAVAILABLE]: 503,
  [COMMON_ERROR_CODES.KAFKA_PUBLISH_FAILED]: 500,
};

/**
 * Normalizes an error from a code.
 *
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
    COMMON_ERROR_MESSAGES[code as CommonErrorCode] ??
    COMMON_ERROR_MESSAGES[COMMON_ERROR_CODES.INTERNAL_ERROR];

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
 *
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

  return normalizeFromCode(COMMON_ERROR_CODES.INTERNAL_ERROR);
};
