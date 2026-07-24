import { z } from "zod"

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

/**
 * Registration Schema for User Sign-Up
 */
export const RegisterSchema = z.object({
  firstName: z
    .string()
    .min(3, "First name must be at least 3 characters")
    .max(50, "First name must not exceed 50 characters"),
  lastName: z
    .string()
    .min(2, "Last name must be at least 2 characters")
    .max(50, "Last name must not exceed 50 characters"),
  email: z.email("Invalid email format").trim(),
  password: passwordSchema,
})

/**
 * Login DTO Schema
 */
export const LoginSchema = z.object({
  email: z.email("Invalid email format").trim(),
  password: passwordSchema,
})

/**
 * OTP Verification DTO Schema
 */
export const VerifyOtpRequestSchema = z.object({
  otp: z
    .string()
    .length(6, "OTP must be exactly 6 digits")
    .regex(/^\d{6}$/, "OTP must contain only numbers"),
})

/**
 * Forgot Password Request DTO Schema
 */
export const ForgotPasswordRequestSchema = z.object({
  email: z.email("Invalid email format").trim(),
})

/**
 * Verify Reset OTP DTO Schema
 */
export const VerifyResetOtpRequestSchema = z.object({
  sessionId: z.uuid("Invalid session ID format"),
  otp: z
    .string()
    .length(6, "OTP must be exactly 6 digits")
    .regex(/^\d{6}$/, "OTP must contain only numbers"),
})

/**
 * Reset Password DTO Schema
 */
export const ResetPasswordRequestSchema = z.object({
  passwordResetToken: z.uuid("Invalid reset token format"),
  password: passwordSchema,
})
