import { ApiError, COMMON_ERROR_CODES } from "@irctc/errors";
import { ClientError, ServerError, Status } from "nice-grpc";
import { ZodError } from "zod";

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

  if (error instanceof ZodError) {
    const formatted = error.issues
      .map((issue) => `${issue.path.join(".") || "field"}: ${issue.message}`)
      .join("; ");
    return new ServerError(
      Status.INVALID_ARGUMENT,
      `Request validation error: ${formatted}`,
    );
  }

  if (error instanceof ApiError) {
    const status = mapApiCodeToGrpcStatus(error.code, error.statusCode);
    return new ServerError(status, error.message);
  }

  return new ServerError(Status.INTERNAL, "Internal server error");
}

/**
 * Translates a gRPC ClientError thrown by gRPC client calls into a domain ApiError.
 *
 * @param error - The error caught from a gRPC client call.
 * @param defaultMessage - Optional user-facing error message override.
 * @returns An {@link ApiError} ready for HTTP response handling.
 */
export function mapGrpcClientErrorToApiError(
  error: unknown,
  defaultMessage = "Upstream gRPC service call failed. Please retry shortly.",
): ApiError {
  if (error instanceof ApiError) {
    return error;
  }

  if (error instanceof ClientError) {
    const httpStatusCode = mapGrpcStatusToHttpStatus(error.code);
    return new ApiError(
      httpStatusCode,
      COMMON_ERROR_CODES.INTERNAL_ERROR,
      defaultMessage,
    );
  }

  if (error instanceof Error) {
    return new ApiError(500, COMMON_ERROR_CODES.INTERNAL_ERROR, error.message);
  }

  return new ApiError(500, COMMON_ERROR_CODES.INTERNAL_ERROR, defaultMessage);
}

/**
 * Translates a gRPC Status code to an HTTP status code integer.
 */
export function mapGrpcStatusToHttpStatus(status: Status): number {
  switch (status) {
    case Status.NOT_FOUND:
      return 404;
    case Status.INVALID_ARGUMENT:
      return 400;
    case Status.UNAUTHENTICATED:
      return 401;
    case Status.PERMISSION_DENIED:
      return 403;
    case Status.ALREADY_EXISTS:
      return 409;
    case Status.RESOURCE_EXHAUSTED:
      return 429;
    case Status.UNAVAILABLE:
      return 503;
    case Status.DEADLINE_EXCEEDED:
      return 504;
    case Status.INTERNAL:
    default:
      return 500;
  }
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
