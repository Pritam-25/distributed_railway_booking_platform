import { normalizeError, createErrorResponse } from "@irctc/errors";
import { createMeta } from "./baseResponse.js";

type MetaExtra = Record<string, unknown>;

/**
 * Generic success response.
 * @param message Success message.
 * @param data Response data.
 * @param metaExtra Additional metadata.
 * @returns Success response object.
 */
export const successResponse = <T>(
  message: string,
  data: T,
  metaExtra?: MetaExtra,
) => ({
  success: true as const,
  message,
  data,
  meta: createMeta(metaExtra),
});

/**
 * Pagination options interface.
 * @field skip The number of records to skip.
 * @field take The number of records to take.
 */
export interface PaginationOptions {
  skip: number;
  take: number;
}

/**
 * Paginated response structure containing the paginated data array and pagination metadata.
 */
export interface PaginatedResult<T> {
  data: T[];
  metadata: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

/**
 * Paginated response for API results.
 * @param message Success message.
 * @param result Paginated result containing data and metadata.
 * @param metaExtra Additional metadata.
 * @returns Paginated response object.
 */
export const paginatedResponse = <T>(
  message: string,
  result: PaginatedResult<T>,
  metaExtra?: MetaExtra,
) => ({
  success: true as const,
  message,
  data: result.data,
  meta: createMeta({
    ...result.metadata,
    ...metaExtra,
  }),
});

/**
 * Error response for API errors.
 * @param error Error object.
 * @param metaExtra Additional metadata.
 * @returns Error response object.
 */
export const errorResponse = (error: unknown, metaExtra?: MetaExtra) => {
  const normalizedError = normalizeError(error);
  const isInternalError = normalizedError.statusCode >= 500;

  const { error: errorPayload } = createErrorResponse({
    code: normalizedError.errorCode,
    message: normalizedError.message,
    details: normalizedError.details,
  });

  if (isInternalError && errorPayload.details !== undefined) {
    delete errorPayload.details;
  }

  return {
    success: false as const,
    error: errorPayload,
    meta: createMeta(metaExtra),
  };
};
