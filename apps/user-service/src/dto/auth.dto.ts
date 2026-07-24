import "@irctc/openapi";
import type { UserResponseDto } from "./user.dto.js";
import { z } from "zod";

/**
 * Password Schema for User Registration and Login
 * Requirements:
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
  .regex(
    /[@$#!%*~?&/\\(){}[\]]/,
    "Password must contain at least one special character",
  )
  .openapi({
    description: "User password",
    example: "Password@123",
  });

/**
 * Register Schema for User Registration
 * Requirements:
 * - First name must be at least 3 characters long
 * - Last name must be at least 2 characters long
 * - Email must be in valid email format
 * - Password must meet the passwordSchema requirements
 * - Confirm password must match the password
 */
export const RegisterSchema = z
  .object({
    firstName: z
      .string()
      .trim()
      .min(3, "First name must be at least 3 characters long")
      .openapi({ example: "Jhon" }),
    lastName: z
      .string()
      .trim()
      .min(2, "Last name must be at least 2 characters long")
      .openapi({ example: "Doe" }),
    email: z
      .email("Invalid email format")
      .trim()
      .openapi({ example: "jhon@example.com" }),
    password: passwordSchema,
    confirmPassword: passwordSchema,
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

/**
 * Login Schema for User Login
 * Requirements:
 * - Email must be in valid email format
 * - Password must meet the passwordSchema requirements
 */
export const LoginSchema = z.object({
  email: z
    .email("Invalid email format")
    .trim()
    .openapi({ example: "jhon@example.co" }),
  password: passwordSchema,
});

/**
 * Verify OTP Request Schema for User Verification
 * Requirements:
 * - OTP must be a 6-digit number
 */
export const VerifyOtpRequestSchema = z.object({
  otp: z
    .string()
    .regex(/^\d{6}$/, "OTP must be a 6-digit number")
    .openapi({ example: "123456" }),
});

export type RegisterRequestDto = z.infer<typeof RegisterSchema>;
export type LoginRequestDto = z.infer<typeof LoginSchema>;
export type VerifyOtpRequestDto = z.infer<typeof VerifyOtpRequestSchema>;

export interface AuthResponseDto {
  user: UserResponseDto;
  tokens: {
    accessToken: string;
    refreshToken: string;
  };
}

/**
 * Forgot Password Schema for requesting OTP
 */
export const ForgotPasswordRequestSchema = z.object({
  email: z.email().trim().openapi({ example: "jhon@example.com" }),
});

/**
 * Schema to verify OTP submitted during the password reset workflow.
 */
export const VerifyResetOtpRequestSchema = z.object({
  sessionId: z.uuid().openapi({
    example: "550e8400-e29b-41d4-a716-446655440000",
  }),
  otp: z
    .string()
    .regex(/^\d{6}$/, "OTP must be a 6-digit number")
    .openapi({ example: "123456" }),
});

/**
 * Reset Password Schema for resetting user password using a verified token
 */
export const ResetPasswordRequestSchema = z
  .object({
    passwordResetToken: z.uuid().openapi({
      example: "550e8400-e29b-41d4-a716-446655440000",
    }),
    password: passwordSchema,
    confirmPassword: passwordSchema,
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type ForgotPasswordRequestDto = z.infer<
  typeof ForgotPasswordRequestSchema
>;
export type VerifyResetOtpRequestDto = z.infer<
  typeof VerifyResetOtpRequestSchema
>;
export type ResetPasswordRequestDto = z.infer<
  typeof ResetPasswordRequestSchema
>;
