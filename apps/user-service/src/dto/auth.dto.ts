import "@irctc/openapi";
import { z } from "zod";
import type { UserResponseDto } from "@dto";

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
 * Registration Schema for User Sign-Up
 */
export const RegisterSchema = z
  .object({
    firstName: z
      .string()
      .min(3, "First name must be at least 3 characters")
      .max(50, "First name must not exceed 50 characters")
      .openapi({ example: "Jhon" }),
    lastName: z
      .string()
      .min(2, "Last name must be at least 2 characters")
      .max(50, "Last name must not exceed 50 characters")
      .openapi({ example: "Doe" }),
    email: z
      .email("Invalid email format")
      .trim()
      .openapi({ example: "jhon@example.com" }),
    password: passwordSchema,
  })
  .openapi("RegisterRequest");

export type RegisterRequestDto = z.infer<typeof RegisterSchema>;

/**
 * Login DTO Schema
 */
export const LoginSchema = z
  .object({
    email: z
      .email("Invalid email format")
      .trim()
      .openapi({ example: "jhon@example.com" }),
    password: passwordSchema,
  })
  .openapi("LoginRequest");

export type LoginRequestDto = z.infer<typeof LoginSchema>;

/**
 * OTP Verification DTO Schema
 */
export const VerifyOtpRequestSchema = z
  .object({
    otp: z
      .string()
      .length(6, "OTP must be exactly 6 digits")
      .regex(/^\d{6}$/, "OTP must contain only numbers")
      .openapi({ example: "123456" }),
  })
  .openapi("VerifyOtpRequest");

export type VerifyOtpRequestDto = z.infer<typeof VerifyOtpRequestSchema>;

export interface AuthResponseDto {
  user: UserResponseDto;
  tokens: {
    accessToken: string;
    refreshToken: string;
  };
}

/**
 * Session summary returned by the active sessions endpoint.
 */
export const SessionSummarySchema = z
  .object({
    sessionId: z.uuid().openapi({
      example: "550e8400-e29b-41d4-a716-446655440000",
    }),
    userId: z.uuid().openapi({
      example: "550e8400-e29b-41d4-a716-446655440000",
    }),
    fingerprint: z.string().openapi({ example: "device-fingerprint" }),
    ipAddress: z.string().openapi({ example: "client-ip-address" }),
    userAgent: z.string().openapi({ example: "Mozilla/5.0..." }),
    location: z.string().openapi({ example: "New Delhi, IN" }),
    createdAt: z.string().openapi({ example: "2026-07-24T00:00:00.000Z" }),
    lastUsedAt: z.string().openapi({ example: "2026-07-24T12:00:00.000Z" }),
    expiresAt: z.string().openapi({ example: "2026-08-23T12:00:00.000Z" }),
  })
  .openapi("SessionSummary");

export type SessionSummaryDto = z.infer<typeof SessionSummarySchema>;

/**
 * Active session payload returned to clients.
 */
export const ActiveSessionSchema = SessionSummarySchema.extend({
  isCurrent: z.boolean(),
}).openapi("ActiveSession");

export type ActiveSessionDto = z.infer<typeof ActiveSessionSchema>;

/**
 * Forgot Password Request DTO Schema
 */
export const ForgotPasswordRequestSchema = z
  .object({
    email: z
      .email("Invalid email format")
      .trim()
      .openapi({ example: "rahul.sharma@example.com" }),
  })
  .openapi("ForgotPasswordRequest");

export type ForgotPasswordRequestDto = z.infer<
  typeof ForgotPasswordRequestSchema
>;

/**
 * Verify Reset OTP DTO Schema
 */
export const VerifyPasswordResetOtpRequestSchema = z
  .object({
    sessionId: z.uuid("Invalid session ID format").openapi({
      example: "550e8400-e29b-41d4-a716-446655440000",
    }),
    otp: z
      .string()
      .length(6, "OTP must be exactly 6 digits")
      .regex(/^\d{6}$/, "OTP must contain only numbers")
      .openapi({ example: "123456" }),
  })
  .openapi("VerifyPasswordResetOtpRequest");

export type VerifyPasswordResetOtpRequestDto = z.infer<
  typeof VerifyPasswordResetOtpRequestSchema
>;

/**
 * Reset Password DTO Schema
 */
export const ResetPasswordRequestSchema = z
  .object({
    passwordResetToken: z.uuid("Invalid reset token format").openapi({
      example: "550e8400-e29b-41d4-a716-446655440000",
    }),
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
