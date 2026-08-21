import { authController } from "@container";
import {
  LoginSchema,
  RegisterSchema,
  VerifyOtpRequestSchema,
  ForgotPasswordRequestSchema,
  VerifyPasswordResetOtpRequestSchema,
  ResetPasswordRequestSchema,
  SessionParamSchema,
} from "@dto";
import {
  validateSchema,
  asyncHandler,
  validateParams,
} from "@irctc/middleware";
import { Router } from "express";
import { sessionMiddleware, trustGatewayHeaders } from "@middleware";

/**
 * Authentication and session management routes.
 *
 * Registers HTTP endpoints under `/api/v1/auth` and applies the request
 * validation and authentication middleware pipeline required by the auth
 * domain.
 *
 * ### Responsibilities
 * - Map authentication, password recovery, and session lifecycle endpoints
 *   to {@link AuthController} handlers.
 * - Apply Zod-based request body and path parameter validation.
 * - Gate authenticated endpoints with {@link trustGatewayHeaders} and
 *   {@link sessionMiddleware}.
 *
 * ### Middleware Pipeline
 * - {@link trustGatewayHeaders} — Extracts identity claims from gateway-injected
 *   headers and attaches them to `req.user`.
 * - {@link sessionMiddleware} — Verifies the active session in Redis and
 *   enforces immediate session revocation and sliding session windows.
 * - {@link validateSchema} / {@link validateParams} — Zod-validates request
 *   body and path parameters before delegating to the controller.
 * - {@link asyncHandler} — Routes async controller exceptions to the global
 *   error handler.
 */
const router: Router = Router();

// Send OTP for registration.
router.post(
  "/send-otp",
  validateSchema(RegisterSchema),
  asyncHandler((req, res) => authController.sendOtp(req, res)),
);

// Verify OTP for registration.
router.post(
  "/verify-otp",
  validateSchema(VerifyOtpRequestSchema),
  asyncHandler((req, res) => authController.verifyOtp(req, res)),
);

// Login
router.post(
  "/login",
  validateSchema(LoginSchema),
  asyncHandler((req, res) => authController.login(req, res)),
);

// Refresh access token
router.post(
  "/refresh",
  asyncHandler((req, res) => authController.refresh(req, res)),
);

// Get all active sessions for the authenticated user
router.get(
  "/sessions",
  trustGatewayHeaders,
  sessionMiddleware,
  asyncHandler((req, res) => authController.getSessions(req, res)),
);

// Revoke a specific session
router.delete(
  "/sessions/:sessionId",
  validateParams(SessionParamSchema),
  trustGatewayHeaders,
  sessionMiddleware,
  asyncHandler((req, res) => authController.revokeSession(req, res)),
);

// Logout from current session
router.post(
  "/logout",
  asyncHandler((req, res) => authController.logout(req, res)),
);

// Logout from all sessions
router.post(
  "/logout-all",
  asyncHandler((req, res) => authController.logoutAll(req, res)),
);

// Send OTP for password reset
router.post(
  "/forgot-password",
  validateSchema(ForgotPasswordRequestSchema),
  asyncHandler((req, res) => authController.forgotPassword(req, res)),
);

// Verify OTP for password reset
router.post(
  "/verify-reset-otp",
  validateSchema(VerifyPasswordResetOtpRequestSchema),
  asyncHandler((req, res) => authController.VerifyPasswordResetOtp(req, res)),
);

// Reset password
router.post(
  "/reset-password",
  validateSchema(ResetPasswordRequestSchema),
  asyncHandler((req, res) => authController.resetPassword(req, res)),
);

export default router;
