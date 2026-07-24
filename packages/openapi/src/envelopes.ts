import "./extend-zod.js";
import { z } from "zod";
import type {
  OpenAPIRegistry,
  RouteConfig,
} from "@asteasolutions/zod-to-openapi";
import { ERROR_CODES, ERROR_MESSAGES, type ErrorCode } from "@irctc/errors";

export type SecurityRequirementObject = NonNullable<RouteConfig["security"]>;

/**
 * Metadata block included in API response envelopes.
 * Matches `createMeta` shape in `@irctc/http`.
 */
export const MetaSchema = z
  .object({
    requestId: z
      .string()
      .openapi({ example: "3e3c1f1a-6f7d-4a2b-9b5c-1f0e3a4b5c6d" }),
    traceId: z
      .string()
      .openapi({ example: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4" }),
    timestamp: z.string().openapi({ example: "2026-07-24T11:21:35.000Z" }),
  })
  .openapi("ResponseMeta");

export type MetaDto = z.infer<typeof MetaSchema>;

/**
 * Reusable schema for empty JSON object payload `{}`
 */
export const EmptySchema = z.object({}).openapi("EmptyResponse");

/**
 * Generic Success Response Envelope Schema `{ success: true, message, data, meta }`
 */
export const SuccessResponseSchema = <T extends z.ZodTypeAny>(
  dataSchema: T,
  messageExample: string = "Operation completed successfully",
) =>
  z
    .object({
      success: z.literal(true).openapi({ example: true }),
      message: z.string().openapi({ example: messageExample }),
      data: dataSchema,
      meta: MetaSchema,
    })
    .openapi({ description: "Success Response Envelope" });

/**
 * Pagination metadata block
 */
export const PaginationMetadataSchema = z
  .object({
    total: z.number().int().openapi({ example: 100 }),
    page: z.number().int().openapi({ example: 1 }),
    limit: z.number().int().openapi({ example: 10 }),
    totalPages: z.number().int().openapi({ example: 10 }),
  })
  .openapi("PaginationMetadata");

export type PaginationMetadataDto = z.infer<typeof PaginationMetadataSchema>;

/**
 * Generic Paginated Response Envelope Schema `{ success: true, message, data: T[], meta }`
 */
export const PaginatedResponseSchema = <T extends z.ZodTypeAny>(
  itemSchema: T,
  messageExample: string = "Items retrieved successfully",
) =>
  z
    .object({
      success: z.literal(true).openapi({ example: true }),
      message: z.string().openapi({ example: messageExample }),
      data: z.array(itemSchema),
      meta: MetaSchema.extend(PaginationMetadataSchema.shape),
    })
    .openapi({ description: "Paginated Response Envelope" });

/**
 * Error envelope builder matching `@irctc/http` errorResponse payload format.
 */
export const createErrorResponseSchema = (
  code: ErrorCode | string,
  message: string,
  schemaName?: string,
) => {
  const schema = z
    .object({
      success: z.literal(false).openapi({ example: false }),
      error: z
        .object({
          code: z.string().openapi({ example: code }),
          message: z.string().openapi({ example: message }),
          details: z.unknown().optional(),
        })
        .openapi({ description: "Error Detail Payload" }),
      meta: MetaSchema,
    })
    .openapi({ description: `Error Response Envelope (${code})` });

  return schemaName ? schema.openapi(schemaName) : schema;
};

/**
 * Helper to wrap Zod schema into OpenAPI JSON content map
 */
export const createOpenApiResponse = (
  description: string,
  schema: z.ZodTypeAny,
) => ({
  description,
  content: {
    "application/json": {
      schema,
    },
  },
});

/**
 * Standard Error Response Schemas mapped by HTTP Status Code
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

/**
 * Common baseline error responses included in almost all microservice endpoints (400, 429, 500).
 * Spread into endpoint responses: `{ 200: ..., ...CommonErrorResponses, 401: ... }`
 */
export const CommonErrorResponses = {
  400: ErrorResponses[400],
  429: ErrorResponses[429],
  500: ErrorResponses[500],
};

/**
 * Standard Security Scheme configuration for Bearer JWT Token
 */
export const bearerAuthScheme = {
  type: "http" as const,
  scheme: "bearer" as const,
  bearerFormat: "JWT",
  description: "Enter JWT Access Token",
};

/**
 * Standard Security Scheme configuration for access_token HTTP-only Cookie
 */
export const cookieAuthScheme = {
  type: "apiKey" as const,
  in: "cookie" as const,
  name: "access_token",
  description: "Access token stored in HTTP-only cookie for browser clients",
};

/**
 * Helper to register Bearer JWT security scheme on an OpenAPI registry
 */
export const registerBearerAuth = (registry: OpenAPIRegistry) => {
  registry.registerComponent("securitySchemes", "bearerAuth", bearerAuthScheme);
};

/**
 * Helper to register Cookie security scheme on an OpenAPI registry
 */
export const registerCookieAuth = (registry: OpenAPIRegistry) => {
  registry.registerComponent("securitySchemes", "cookieAuth", cookieAuthScheme);
};

/**
 * Helper to register all standard API Gateway authentication security schemes (Bearer + Cookie)
 */
export const registerGatewayAuth = (registry: OpenAPIRegistry) => {
  registerBearerAuth(registry);
  registerCookieAuth(registry);
};

/**
 * Standard Security Requirements arrays for API route registration.
 * Usage in registerPath: `security: GatewayAuthSecurity` or `security: SecurityRequirements.bearerAuth`
 */
export const SecurityRequirements: Record<string, SecurityRequirementObject> = {
  bearerAuth: [{ bearerAuth: [] }],
  cookieAuth: [{ cookieAuth: [] }],
  gatewayAuth: [{ bearerAuth: [] }, { cookieAuth: [] }],
};

export const GatewayAuthSecurity: SecurityRequirementObject =
  SecurityRequirements["gatewayAuth"]!;
