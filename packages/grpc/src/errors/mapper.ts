import { ApiError, COMMON_ERROR_CODES } from "@irctc/errors";
import { ServerError, Status } from "nice-grpc";

/**
 * Maps a domain ApiError (or generic Error) to a canonical gRPC ServerError.
 *
 * @param error - The caught domain or runtime error.
 * @returns A gRPC ServerError instance with the appropriate Status code.
 */
export function mapToGrpcError(error: unknown): ServerError {
  if (error instanceof ServerError) {
    return error;
  }

  if (error instanceof ApiError) {
    const status = mapApiCodeToGrpcStatus(error.code, error.statusCode);
    return new ServerError(status, error.message);
  }

  const message =
    error instanceof Error ? error.message : "Internal server error";
  return new ServerError(Status.INTERNAL, message);
}

/**
 * Translates a domain error code string or HTTP status code to a gRPC Status.
 */
export function mapApiCodeToGrpcStatus(
  code: string,
  statusCode?: number,
): Status {
  switch (code) {
    case COMMON_ERROR_CODES.NOT_FOUND:
      return Status.NOT_FOUND;
    case COMMON_ERROR_CODES.INVALID_INPUT:
      return Status.INVALID_ARGUMENT;
    case COMMON_ERROR_CODES.UNAUTHORIZED:
      return Status.UNAUTHENTICATED;
    case COMMON_ERROR_CODES.FORBIDDEN:
      return Status.PERMISSION_DENIED;
    case COMMON_ERROR_CODES.CONFLICT:
      return Status.ALREADY_EXISTS;
    case COMMON_ERROR_CODES.RATE_LIMIT_EXCEEDED:
      return Status.RESOURCE_EXHAUSTED;
    case COMMON_ERROR_CODES.SERVICE_UNAVAILABLE:
    case COMMON_ERROR_CODES.KAFKA_PUBLISH_FAILED:
      return Status.UNAVAILABLE;
    case COMMON_ERROR_CODES.INTERNAL_ERROR:
    default:
      if (statusCode === 404) return Status.NOT_FOUND;
      if (statusCode === 400 || statusCode === 422)
        return Status.INVALID_ARGUMENT;
      if (statusCode === 401) return Status.UNAUTHENTICATED;
      if (statusCode === 403) return Status.PERMISSION_DENIED;
      if (statusCode === 409) return Status.ALREADY_EXISTS;
      if (statusCode === 429) return Status.RESOURCE_EXHAUSTED;
      if (statusCode === 503) return Status.UNAVAILABLE;
      return Status.INTERNAL;
  }
}
