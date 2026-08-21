import "@irctc/openapi";
import { z } from "zod";
import type { UserResponseDto } from "@dto";

/**
 * Reusable email schema
 */
export const emailSchema = z
  .email("Invalid email format")
  .trim()
  .openapi({ example: "jhon@example.com" });

/**
 * Reusable UUID schema factory with a configurable error message.
 *
 * @param message - Error message used when the value is not a valid UUID.
 */
export const uuidSchema = (message = "Invalid UUID format") =>
  z.uuid(message).openapi({
    example: "550e8400-e29b-41d4-a716-446655440000",
  });

/**
 * Reusable first-name schema (3-50 characters, trimmed).
 */
export const firstNameSchema = z
  .string()
  .trim()
  .min(3, "First name must be at least 3 characters long")
  .max(50, "First name must not exceed 50 characters")
  .openapi({ example: "Jhon" });

/**
 * Reusable last-name schema (2-50 characters, trimmed).
 */
export const lastNameSchema = z
  .string()
  .trim()
  .min(2, "Last name must be at least 2 characters long")
  .max(50, "Last name must not exceed 50 characters")
  .openapi({ example: "Doe" });

/**
 * Reusable Password Schema
 * - Minimum 6 characters
 * - Must contain at least one uppercase letter
 * - Must contain at least one number
 * - Must contain at least one special character
 */
export const passwordSchema = z
  .string()
  .min(6, "Password must be at least 6 characters long")
  .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
  .regex(/\d/, "Password must contain at least one number")
  .regex(/[^a-zA-Z0-9]/, "Password must contain at least one special character")
  .openapi({
    pattern: String.raw`^(?=.*[A-Z])(?=.*\d)(?=.*[^a-zA-Z0-9]).{6,}$`,
    example: "Password@123",
    description:
      "### Password Requirements\n\n- Minimum **6** characters\n- At least **1 uppercase** letter\n- At least **1 number**\n- At least **1 special character**",
  });

/**
 * Reusable OTP schema accepting exactly six numeric digits.
 */
export const otpSchema = z
  .string()
  .length(6, "OTP must be exactly 6 digits")
  .regex(/^\d{6}$/, "OTP must contain only numbers")
  .openapi({ example: "123456" });

/**
 * Registration request body schema for user sign-up.
 */
export const RegisterSchema = z
  .object({
    firstName: firstNameSchema,
    lastName: lastNameSchema,
    email: emailSchema,
    password: passwordSchema,
  })
  .openapi("RegisterRequest");

export type RegisterRequestDto = z.infer<typeof RegisterSchema>;

/**
 * Login request body schema (email + password).
 */
export const LoginSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
  })
  .openapi("LoginRequest");

export type LoginRequestDto = z.infer<typeof LoginSchema>;

/**
 * OTP verification request body schema (6-digit code).
 */
export const VerifyOtpRequestSchema = z
  .object({
    otp: otpSchema,
  })
  .openapi("VerifyOtpRequest");

export type VerifyOtpRequestDto = z.infer<typeof VerifyOtpRequestSchema>;

/**
 * Authentication response payload containing the user profile and the
 * JWT token pair.
 */
export interface AuthResponseDto {
  user: UserResponseDto;
  tokens: {
    accessToken: string;
    refreshToken: string;
  };
}

/**
 * Session summary returned by the active sessions endpoint. Strips the
 * refresh-token hash and other server-only fields from the underlying
 * Redis session record.
 */
export const SessionSummarySchema = z
  .object({
    sessionId: uuidSchema("Session ID must be a valid UUID"),
    userId: uuidSchema("User ID must be a valid UUID"),
    fingerprint: z.string().openapi({
      example:
        "9b32928e81333d238159cd131c9551adce20bd02b90d4a6a89d482ff4c10fba7",
    }),
    ipAddress: z.string().openapi({ example: "192:168:1:1" }),
    userAgent: z.string().openapi({
      example:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
    }),
    location: z.string().openapi({ example: "New Delhi, IN" }),
    createdAt: z.iso
      .datetime()
      .openapi({ example: "2026-07-24T00:00:00.000Z" }),
    lastUsedAt: z.iso
      .datetime()
      .openapi({ example: "2026-07-24T12:00:00.000Z" }),
    expiresAt: z.iso
      .datetime()
      .openapi({ example: "2026-08-23T12:00:00.000Z" }),
  })
  .openapi("SessionSummary");

export type SessionSummaryDto = z.infer<typeof SessionSummarySchema>;

/**
 * Forgot-password request body schema (email).
 */
export const ForgotPasswordRequestSchema = z
  .object({
    email: emailSchema,
  })
  .openapi("ForgotPasswordRequest");

export type ForgotPasswordRequestDto = z.infer<
  typeof ForgotPasswordRequestSchema
>;

/**
 * Verify-password-reset-OTP request body schema (`sessionId` + OTP).
 */
export const VerifyPasswordResetOtpRequestSchema = z
  .object({
    sessionId: uuidSchema("Session ID must be a valid UUID"),
    otp: otpSchema,
  })
  .openapi("VerifyPasswordResetOtpRequest");

export type VerifyPasswordResetOtpRequestDto = z.infer<
  typeof VerifyPasswordResetOtpRequestSchema
>;

/**
 * Reset-password request body schema. Requires the reset token plus a
 * matching new-password / confirm-password pair.
 */
export const ResetPasswordRequestSchema = z
  .object({
    passwordResetToken: uuidSchema("Password reset token must be a valid UUID"),
    password: passwordSchema,
    confirmPassword: passwordSchema,
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  })
  .openapi("ResetPasswordRequest");

export type ResetPasswordRequestDto = z.infer<
  typeof ResetPasswordRequestSchema
>;

/**
 * Active session payload returned to clients, extending
 * {@link SessionSummaryDto} with an `isCurrent` flag.
 */
export const ActiveSessionSchema = SessionSummarySchema.extend({
  isCurrent: z.boolean().openapi({ example: true }),
}).openapi("ActiveSession");

export type ActiveSessionDto = z.infer<typeof ActiveSessionSchema>;

/**
 * Internal session record stored in Redis. Includes the refresh-token
 * hash so {@link AuthService.refresh} can detect token reuse. Never
 * returned over the wire.
 */
export const SessionRecordSchema = SessionSummarySchema.omit({
  sessionId: true,
}).extend({
  refreshTokenHash: z.string(),
});

export type SessionRecord = z.infer<typeof SessionRecordSchema>;

/**
 * Public projection of the session record: everything in
 * {@link SessionSummaryDto} except `sessionId`, which is supplied by the
 * caller at the point of use. Use this whenever a Redis blob is parsed
 * and intended to be returned to clients.
 */
export const PublicSessionDataSchema = SessionSummarySchema.omit({
  sessionId: true,
});

export type PublicSessionData = z.infer<typeof PublicSessionDataSchema>;

/**
 * Forgot-password response payload (issued reset session ID).
 */
export const ForgotPasswordResponseSchema = z
  .object({
    sessionId: uuidSchema("Session ID must be a valid UUID"),
  })
  .openapi("ForgotPasswordResponse");

export type ForgotPasswordResponseDto = z.infer<
  typeof ForgotPasswordResponseSchema
>;

/**
 * Verify-password-reset-OTP response payload (single-use reset token).
 */
export const VerifyPasswordResetOtpResponseSchema = z
  .object({
    passwordResetToken: uuidSchema("Password reset token must be a valid UUID"),
  })
  .openapi("VerifyPasswordResetOtpResponse");

export type VerifyPasswordResetOtpResponseDto = z.infer<
  typeof VerifyPasswordResetOtpResponseSchema
>;

/**
 * Path-parameter schema for `:sessionId` on session revocation endpoints.
 */
export const SessionParamSchema = z
  .object({
    sessionId: uuidSchema("Session ID must be a valid UUID"),
  })
  .openapi("SessionParam");
