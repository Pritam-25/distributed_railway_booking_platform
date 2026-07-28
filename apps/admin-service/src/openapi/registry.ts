import {
  OpenAPIRegistry,
  SuccessResponseSchema,
  createOpenApiResponse,
  createErrorResponseSchema,
  CommonErrorResponses,
  EmptySchema,
  registerGatewayAuth,
  z,
} from "@irctc/openapi";
import { ERROR_CODES, ERROR_MESSAGES } from "@irctc/errors";
import { adminLoginSchema } from "@dto";
import { adminServiceOpenApiDescriptions } from "./descriptions.js";

export const registry = new OpenAPIRegistry();

/**
 * Response schema for the admin login endpoint.
 *
 * Mirrors `AdminAuthResponseDto` from `@dto/auth.dto.ts` as a Zod schema so it
 * can flow through the OpenAPI registry. The TypeScript `interface` is kept in
 * `auth.dto.ts` for internal service-layer typing — this schema exists purely
 * for spec generation and is not used at runtime.
 */
export const adminAuthResponseSchema = z
  .object({
    admin: z.object({
      id: z
        .string()
        .openapi({ example: "550e8400-e29b-41d4-a716-446655440000" }),
      email: z.string().openapi({ example: "admin@irctc.co.in" }),
    }),
  })
  .openapi("AdminAuthResponse");

/**
 * Register Component Schemas.
 */
registry.register("AdminLoginRequest", adminLoginSchema);
registry.register("AdminAuthResponse", adminAuthResponseSchema);

/**
 * Security Schemes (Bearer JWT & access_token Cookie for Gateway Auth).
 *
 * The public login endpoint is unauthenticated; logout requires an active
 * admin session via Bearer JWT or the admin access_token cookie.
 */
registerGatewayAuth(registry);

// ─── Authentication Endpoints ───────────────────────────────────────────────

/**
 * POST /api/v1/admin/auth/login
 *
 * Admin authentication endpoint. Unauthenticated. Returns the admin profile
 * and a signed JWT access token on success.
 */
registry.registerPath({
  method: "post",
  path: "/api/v1/admin/auth/login",
  operationId: "adminLogin",
  tags: ["Admin"],
  summary: adminServiceOpenApiDescriptions.auth.login.summary,
  description: adminServiceOpenApiDescriptions.auth.login.description,
  security: [],
  request: {
    body: {
      content: {
        "application/json": {
          schema: adminLoginSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: createOpenApiResponse(
      "Login successful",
      SuccessResponseSchema(adminAuthResponseSchema, "Admin Login successful"),
    ),
    ...CommonErrorResponses,
    401: createOpenApiResponse(
      "Invalid credentials",
      createErrorResponseSchema(
        ERROR_CODES.UNAUTHORIZED,
        ERROR_MESSAGES[ERROR_CODES.UNAUTHORIZED],
      ),
    ),
  },
});

/**
 * POST /api/v1/admin/auth/logout
 *
 * Clears the admin access token cookie for the current session. Idempotent.
 * Authenticated via Bearer JWT or admin access_token cookie.
 */
registry.registerPath({
  method: "post",
  path: "/api/v1/admin/auth/logout",
  operationId: "adminLogout",
  tags: ["Admin"],
  summary: adminServiceOpenApiDescriptions.auth.logout.summary,
  description: adminServiceOpenApiDescriptions.auth.logout.description,
  // Both Bearer JWT and cookie auth are accepted; the routes file's
  // `requireAdmin` middleware enforces the actual auth check at runtime.
  security: [{ bearerAuth: [] }, { cookieAuth: [] }],
  responses: {
    200: createOpenApiResponse(
      "Logged out successfully from Admin context",
      SuccessResponseSchema(
        EmptySchema,
        "Logged out successfully from Admin context",
      ),
    ),
    ...CommonErrorResponses,
    401: createOpenApiResponse(
      "Unauthorized - Admin token is missing, invalid, or expired",
      createErrorResponseSchema(
        ERROR_CODES.UNAUTHORIZED,
        ERROR_MESSAGES[ERROR_CODES.UNAUTHORIZED],
      ),
    ),
  },
});
