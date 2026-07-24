import {
  OpenAPIRegistry,
  SuccessResponseSchema,
  createOpenApiResponse,
  CommonErrorResponses,
  ErrorResponses,
  createErrorResponseSchema,
  EmptySchema,
  registerBearerAuth,
  z,
} from "@irctc/openapi";
import { ERROR_CODES } from "@irctc/errors";
import {
  RegisterSchema,
  LoginSchema,
  VerifyOtpRequestSchema,
  ForgotPasswordRequestSchema,
  VerifyResetOtpRequestSchema,
  ResetPasswordRequestSchema,
  UserResponseSchema,
  UserUpdateSchema,
} from "@dto";
import { ERROR_MESSAGES, ERROR_CODES as USER_ERROR } from "@utils/errors";

export const registry = new OpenAPIRegistry();

/**
 * Register Component Schemas
 */
registry.register("RegisterRequest", RegisterSchema);
registry.register("LoginRequest", LoginSchema);
registry.register("VerifyOtpRequest", VerifyOtpRequestSchema);
registry.register("ForgotPasswordRequest", ForgotPasswordRequestSchema);
registry.register("VerifyResetOtpRequest", VerifyResetOtpRequestSchema);
registry.register("ResetPasswordRequest", ResetPasswordRequestSchema);
registry.register("UserResponse", UserResponseSchema);
registry.register("UserUpdateRequest", UserUpdateSchema);

/**
 * Security Schemes
 */
registerBearerAuth(registry);

/**
 * Authentication Endpoints
 */
registry.registerPath({
  method: "post",
  path: "/api/v1/auth/send-otp",
  tags: ["Authentication"],
  summary: "Send OTP for User Registration",
  request: {
    body: {
      content: {
        "application/json": {
          schema: RegisterSchema,
        },
      },
    },
  },
  responses: {
    200: createOpenApiResponse(
      "OTP sent successfully to email",
      SuccessResponseSchema(EmptySchema, "OTP sent to your email successfully"),
    ),
    ...CommonErrorResponses,
    409: createOpenApiResponse(
      "User already exists",
      createErrorResponseSchema(
        USER_ERROR.USER_ALREADY_EXISTS,
        ERROR_MESSAGES.USER_ALREADY_EXISTS,
      ),
    ),
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/auth/verify-otp",
  tags: ["Authentication"],
  summary: "Verify OTP & Complete Registration",
  request: {
    body: {
      content: {
        "application/json": {
          schema: VerifyOtpRequestSchema,
        },
      },
    },
  },
  responses: {
    200: createOpenApiResponse(
      "User verified and authenticated successfully",
      SuccessResponseSchema(UserResponseSchema, "Registration successful"),
    ),
    ...CommonErrorResponses,
    400: createOpenApiResponse(
      "Invalid or expired OTP",
      createErrorResponseSchema(
        ERROR_CODES.INVALID_INPUT,
        "Invalid or expired OTP code",
      ),
    ),
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/auth/login",
  tags: ["Authentication"],
  summary: "Login User",
  request: {
    body: {
      content: {
        "application/json": {
          schema: LoginSchema,
        },
      },
    },
  },
  responses: {
    200: createOpenApiResponse(
      "Login successful",
      SuccessResponseSchema(UserResponseSchema, "Login successful"),
    ),
    ...CommonErrorResponses,
    401: createOpenApiResponse(
      "Invalid credentials",
      createErrorResponseSchema(
        ERROR_CODES.UNAUTHORIZED,
        ERROR_MESSAGES.INVALID_CREDENTIALS,
      ),
    ),
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/auth/refresh",
  tags: ["Authentication"],
  summary: "Refresh Access Token",
  responses: {
    200: createOpenApiResponse(
      "Token refreshed successfully",
      SuccessResponseSchema(
        z.object({
          accessToken: z.string().openapi({ example: "eyJhbGciOi..." }),
        }),
        "Token refreshed successfully",
      ),
    ),
    ...CommonErrorResponses,
    401: createOpenApiResponse(
      "Unauthorized - Refresh token is missing, invalid, or expired",
      createErrorResponseSchema(
        ERROR_CODES.UNAUTHORIZED,
        ERROR_MESSAGES.REFRESH_TOKEN_INVALID,
      ),
    ),
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/auth/sessions",
  tags: ["Authentication"],
  summary: "Get Active User Sessions",
  security: [{ bearerAuth: [] }],
  responses: {
    200: createOpenApiResponse(
      "List of active sessions",
      SuccessResponseSchema(
        z.array(
          z.object({
            id: z.string().openapi({ format: "uuid" }),
            ipAddress: z.string().openapi({ example: "192.168.1.1" }),
            userAgent: z.string().openapi({ example: "Mozilla/5.0..." }),
            createdAt: z
              .string()
              .openapi({ example: "2026-07-24T00:00:00.000Z" }),
          }),
        ),
        "Active sessions retrieved successfully",
      ),
    ),
    ...CommonErrorResponses,
    401: ErrorResponses[401],
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/v1/auth/sessions/{sessionId}",
  tags: ["Authentication"],
  summary: "Revoke Active Session",
  security: [{ bearerAuth: [] }],
  request: {
    params: z.object({
      sessionId: z.string().openapi({
        format: "uuid",
        example: "550e8400-e29b-41d4-a716-446655440000",
      }),
    }),
  },
  responses: {
    200: createOpenApiResponse(
      "Session revoked successfully",
      SuccessResponseSchema(EmptySchema, "Session revoked successfully"),
    ),
    ...CommonErrorResponses,
    401: ErrorResponses[401],
    404: createOpenApiResponse(
      "Session Not Found",
      createErrorResponseSchema(
        ERROR_CODES.NOT_FOUND,
        "Active session not found",
      ),
    ),
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/auth/logout",
  tags: ["Authentication"],
  summary: "Logout Current Session",
  security: [{ bearerAuth: [] }],
  responses: {
    200: createOpenApiResponse(
      "Logged out successfully",
      SuccessResponseSchema(EmptySchema, "Logged out successfully"),
    ),
    ...CommonErrorResponses,
    401: ErrorResponses[401],
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/auth/logout-all",
  tags: ["Authentication"],
  summary: "Logout All Sessions",
  security: [{ bearerAuth: [] }],
  responses: {
    200: createOpenApiResponse(
      "Logged out from all sessions",
      SuccessResponseSchema(
        EmptySchema,
        "Logged out from all sessions successfully",
      ),
    ),
    ...CommonErrorResponses,
    401: ErrorResponses[401],
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/auth/forgot-password",
  tags: ["Authentication"],
  summary: "Request Password Reset OTP",
  request: {
    body: {
      content: {
        "application/json": {
          schema: ForgotPasswordRequestSchema,
        },
      },
    },
  },
  responses: {
    200: createOpenApiResponse(
      "Password reset OTP sent to email",
      SuccessResponseSchema(
        EmptySchema,
        "Password reset OTP sent successfully",
      ),
    ),
    ...CommonErrorResponses,
    404: createOpenApiResponse(
      "User Not Found",
      createErrorResponseSchema(
        ERROR_CODES.NOT_FOUND,
        ERROR_MESSAGES.USER_NOT_FOUND,
      ),
    ),
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/auth/verify-reset-otp",
  tags: ["Authentication"],
  summary: "Verify Password Reset OTP",
  request: {
    body: {
      content: {
        "application/json": {
          schema: VerifyResetOtpRequestSchema,
        },
      },
    },
  },
  responses: {
    200: createOpenApiResponse(
      "OTP verified, returns password reset token",
      SuccessResponseSchema(
        z.object({
          passwordResetToken: z.string().openapi({
            format: "uuid",
            example: "550e8400-e29b-41d4-a716-446655440000",
          }),
        }),
        "Reset OTP verified successfully",
      ),
    ),
    ...CommonErrorResponses,
    400: createOpenApiResponse(
      "Invalid or expired OTP",
      createErrorResponseSchema(
        ERROR_CODES.INVALID_INPUT,
        "Invalid or expired reset OTP",
      ),
    ),
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/auth/reset-password",
  tags: ["Authentication"],
  summary: "Reset Password",
  request: {
    body: {
      content: {
        "application/json": {
          schema: ResetPasswordRequestSchema,
        },
      },
    },
  },
  responses: {
    200: createOpenApiResponse(
      "Password reset successfully",
      SuccessResponseSchema(EmptySchema, "Password reset successfully"),
    ),
    ...CommonErrorResponses,
  },
});

/**
 * User Profile Endpoints
 */
registry.registerPath({
  method: "get",
  path: "/api/v1/users/me",
  tags: ["User Profile"],
  summary: "Get Current User Profile",
  security: [{ bearerAuth: [] }],
  responses: {
    200: createOpenApiResponse(
      "User profile retrieved successfully",
      SuccessResponseSchema(
        UserResponseSchema,
        "User profile retrieved successfully",
      ),
    ),
    ...CommonErrorResponses,
    401: ErrorResponses[401],
    404: createOpenApiResponse(
      "User Profile Not Found",
      createErrorResponseSchema(
        ERROR_CODES.NOT_FOUND,
        ERROR_MESSAGES.USER_NOT_FOUND,
      ),
    ),
  },
});

registry.registerPath({
  method: "put",
  path: "/api/v1/users/me",
  tags: ["User Profile"],
  summary: "Update Current User Profile",
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      content: {
        "application/json": {
          schema: UserUpdateSchema,
        },
      },
    },
  },
  responses: {
    200: createOpenApiResponse(
      "Profile updated successfully",
      SuccessResponseSchema(
        UserResponseSchema,
        "User profile updated successfully",
      ),
    ),
    ...CommonErrorResponses,
    401: ErrorResponses[401],
  },
});
