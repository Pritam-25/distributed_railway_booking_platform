import {
  OpenAPIRegistry,
  SuccessResponseSchema,
  createOpenApiResponse,
  CommonErrorResponses,
  ErrorResponses,
  createErrorResponseSchema,
  EmptySchema,
  registerGatewayAuth,
  GatewayAuthSecurity,
  ErrorResponseSchema,
  ErrorDetailSchema,
  z,
} from "@irctc/openapi";
import { ERROR_CODES } from "@irctc/errors";
import {
  RegisterSchema,
  LoginSchema,
  VerifyOtpRequestSchema,
  ForgotPasswordRequestSchema,
  VerifyPasswordResetOtpRequestSchema,
  ResetPasswordRequestSchema,
  UserResponseSchema,
  UpdateProfileSchema,
  SessionSummarySchema,
  ActiveSessionSchema,
  ForgotPasswordResponseSchema,
  VerifyPasswordResetOtpResponseSchema,
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
registry.register(
  "VerifyPasswordResetOtpRequest",
  VerifyPasswordResetOtpRequestSchema,
);
registry.register("ResetPasswordRequest", ResetPasswordRequestSchema);
registry.register("UpdateProfileRequest", UpdateProfileSchema);
registry.register("SessionSummary", SessionSummarySchema);
registry.register("ActiveSession", ActiveSessionSchema);
registry.register("ErrorDetail", ErrorDetailSchema);
registry.register("ErrorResponse", ErrorResponseSchema);

/**
 * Security Schemes (Bearer JWT & access_token Cookie for Gateway Auth)
 */
registerGatewayAuth(registry);

/**
 * Authentication Endpoints
 */
registry.registerPath({
  method: "post",
  path: "/api/v1/auth/send-otp",
  operationId: "sendOtp",
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
  operationId: "verifyOtp",
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
  operationId: "login",
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
  operationId: "refreshToken",
  tags: ["Authentication"],
  summary: "Refresh Access Token",
  responses: {
    200: createOpenApiResponse(
      "Token refreshed successfully",
      SuccessResponseSchema(UserResponseSchema, "Token refreshed successfully"),
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
  operationId: "getSessions",
  tags: ["Authentication"],
  summary: "Get Active User Sessions",
  security: GatewayAuthSecurity,
  responses: {
    200: createOpenApiResponse(
      "List of active sessions",
      SuccessResponseSchema(
        z.array(ActiveSessionSchema),
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
  operationId: "revokeSession",
  tags: ["Authentication"],
  summary: "Revoke Active Session",
  security: GatewayAuthSecurity,
  request: {
    params: z.object({
      sessionId: z
        .uuid()
        .openapi({ example: "550e8400-e29b-41d4-a716-446655440000" }),
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
  operationId: "logout",
  tags: ["Authentication"],
  summary: "Logout Current Session",
  responses: {
    200: createOpenApiResponse(
      "Logged out successfully",
      SuccessResponseSchema(EmptySchema, "Logged out successfully"),
    ),
    ...CommonErrorResponses,
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/auth/logout-all",
  operationId: "logoutAll",
  tags: ["Authentication"],
  summary: "Logout All Sessions",
  responses: {
    200: createOpenApiResponse(
      "Logged out from all sessions",
      SuccessResponseSchema(EmptySchema, "Logged out from all devices"),
    ),
    ...CommonErrorResponses,
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/auth/forgot-password",
  operationId: "forgotPassword",
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
        ForgotPasswordResponseSchema,
        "OTP sent successfully to your registered email",
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
  operationId: "VerifyPasswordResetOtp",
  tags: ["Authentication"],
  summary: "Verify Password Reset OTP",
  request: {
    body: {
      content: {
        "application/json": {
          schema: VerifyPasswordResetOtpRequestSchema,
        },
      },
    },
  },
  responses: {
    200: createOpenApiResponse(
      "OTP verified, returns password reset token",
      SuccessResponseSchema(
        VerifyPasswordResetOtpResponseSchema,
        "OTP verified successfully",
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
  operationId: "resetPassword",
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
      SuccessResponseSchema(
        EmptySchema,
        "Password reset successfully. Please login with your new credentials.",
      ),
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
  operationId: "getProfile",
  tags: ["User Profile"],
  summary: "Get Current User Profile",
  security: GatewayAuthSecurity,
  responses: {
    200: createOpenApiResponse(
      "User profile retrieved successfully",
      SuccessResponseSchema(
        UserResponseSchema,
        "Profile retrieved successfully",
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
  operationId: "updateProfile",
  tags: ["User Profile"],
  summary: "Update Current User Profile",
  security: GatewayAuthSecurity,
  request: {
    body: {
      content: {
        "application/json": {
          schema: UpdateProfileSchema,
        },
      },
    },
  },
  responses: {
    200: createOpenApiResponse(
      "Profile updated successfully",
      SuccessResponseSchema(UserResponseSchema, "Profile updated successfully"),
    ),
    ...CommonErrorResponses,
    401: ErrorResponses[401],
  },
});
