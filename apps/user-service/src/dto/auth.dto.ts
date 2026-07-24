import "@irctc/openapi";
import { z } from "zod";

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
    allOf: [
      { pattern: "[A-Z]" },
      { pattern: "d" },
      { pattern: "[^a-zA-Z0-9]" },
    ],
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
export const VerifyResetOtpRequestSchema = z
  .object({
    email: z
      .email("Invalid email format")
      .trim()
      .openapi({ example: "rahul.sharma@example.com" }),
    otp: z
      .string()
      .length(6, "OTP must be exactly 6 digits")
      .regex(/^\d{6}$/, "OTP must contain only numbers")
      .openapi({ example: "123456" }),
  })
  .openapi("VerifyResetOtpRequest");

export type VerifyResetOtpRequestDto = z.infer<
  typeof VerifyResetOtpRequestSchema
>;

/**
 * Reset Password DTO Schema
 */
export const ResetPasswordRequestSchema = z
  .object({
    passwordResetToken: z.uuid("Invalid reset token format").openapi({
      example: "550e8400-e29b-41d4-a716-446655440000",
    }),
    newPassword: passwordSchema,
  })
  .openapi("ResetPasswordRequest");

export type ResetPasswordRequestDto = z.infer<
  typeof ResetPasswordRequestSchema
>;
