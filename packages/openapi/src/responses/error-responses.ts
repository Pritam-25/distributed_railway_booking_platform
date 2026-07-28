import "../extend-zod.js";
import { z } from "zod";
import { ERROR_CODES, ERROR_MESSAGES, type ErrorCode } from "@irctc/errors";
import { MetaSchema } from "../schemas/meta.js";
import { createOpenApiResponse } from "./create-response.js";

/**
 * Build a typed error envelope schema for a specific `(code, message)` pair.
 *
 * The returned schema is the standard error envelope
 * (`{ success: false, error: { code, message, details? }, meta }`). When
 * `schemaName` is supplied the schema is registered as a named component —
 * downstream consumers reference it via `$ref` instead of inlining the same
 * shape under every status code.
 *
 * The `x-sdk-ref: "ErrorResponse"` marker is authoritative for the orval
 * transformer in `apps/web/scripts/orval-transformer.ts`: it detects per-status
 * variants by this marker and collapses them into the single `ErrorResponse`
 * reference the React Query client expects.
 */
export const createErrorResponseSchema = (
  code: ErrorCode | (string & {}),
  message: string,
  schemaName?: string,
) => {
  const metadata: Record<string, unknown> = {
    description: `Error Response Envelope (${code})`,
    "x-sdk-ref": "ErrorResponse",
  };
  if (schemaName) {
    metadata.refId = schemaName;
  }

  const schema = z.object({
    success: z.literal(false).openapi({ example: false }),
    error: z
      .object({
        code: z.string().openapi({ example: code }),
        message: z.string().openapi({ example: message }),
        details: z.unknown().optional(),
      })
      .openapi({ description: "Error Detail Payload" }),
    meta: MetaSchema,
  });

  return schemaName
    ? schema.openapi(schemaName, metadata)
    : schema.openapi(metadata);
};

/**
 * Standard error responses keyed by HTTP status code.
 *
 * Built once at module load and reused by services that need a full error map
 * (e.g. documented fallback tables). For most endpoints use
 * `CommonErrorResponses` (just 400/429/500) and override specific statuses
 * inline — spreading `ErrorResponses` into every endpoint is verbose.
 */
export const ErrorResponses = {
  400: createOpenApiResponse(
    "Bad Request - Validation or invalid input error",
    createErrorResponseSchema(
      ERROR_CODES.BAD_REQUEST,
      ERROR_MESSAGES[ERROR_CODES.BAD_REQUEST],
      "BadRequestErrorResponse",
    ),
  ),
  401: createOpenApiResponse(
    "Unauthorized - Authentication credentials missing or invalid",
    createErrorResponseSchema(
      ERROR_CODES.UNAUTHORIZED,
      ERROR_MESSAGES[ERROR_CODES.UNAUTHORIZED],
      "UnauthorizedErrorResponse",
    ),
  ),
  403: createOpenApiResponse(
    "Forbidden - Access denied",
    createErrorResponseSchema(
      ERROR_CODES.FORBIDDEN,
      ERROR_MESSAGES[ERROR_CODES.FORBIDDEN],
      "ForbiddenErrorResponse",
    ),
  ),
  404: createOpenApiResponse(
    "Not Found - Requested resource was not found",
    createErrorResponseSchema(
      ERROR_CODES.NOT_FOUND,
      ERROR_MESSAGES[ERROR_CODES.NOT_FOUND],
      "NotFoundErrorResponse",
    ),
  ),
  409: createOpenApiResponse(
    "Conflict - Resource already exists or state conflict",
    createErrorResponseSchema(
      ERROR_CODES.CONFLICT,
      ERROR_MESSAGES[ERROR_CODES.CONFLICT],
      "ConflictErrorResponse",
    ),
  ),
  429: createOpenApiResponse(
    "Too Many Requests - Rate limit exceeded",
    createErrorResponseSchema(
      ERROR_CODES.RATE_LIMIT_EXCEEDED,
      ERROR_MESSAGES[ERROR_CODES.RATE_LIMIT_EXCEEDED],
      "RateLimitErrorResponse",
    ),
  ),
  500: createOpenApiResponse(
    "Internal Server Error - Unexpected server error",
    createErrorResponseSchema(
      ERROR_CODES.INTERNAL_ERROR,
      ERROR_MESSAGES[ERROR_CODES.INTERNAL_ERROR],
      "InternalServerErrorResponse",
    ),
  ),
  503: createOpenApiResponse(
    "Service Unavailable - Service temporarily unavailable",
    createErrorResponseSchema(
      ERROR_CODES.SERVICE_UNAVAILABLE,
      ERROR_MESSAGES[ERROR_CODES.SERVICE_UNAVAILABLE],
      "ServiceUnavailableErrorResponse",
    ),
  ),
};
