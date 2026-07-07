import { authController } from "@container";
import { LoginSchema, RegisterSchema, VerifyOtpRequestSchema } from "@dto";
import { validateSchema, asyncHandler } from "@irctc/middleware";
import { Router } from "express";
import { sessionMiddleware, requireUser } from "@middleware";

/**
 * All routes for authentication and authorization
 * Base path: /api/v1/auth
 */
const router: Router = Router();

/**
 * POST /api/v1/auth/send-otp
 * Send OTP to user for registration
 */
router.post(
  "/send-otp",
  validateSchema(RegisterSchema),
  asyncHandler((req, res) => authController.sendOtp(req, res)),
);

/**
 * POST /api/v1/auth/verify-otp
 * Verify OTP sent to user for registration
 */
router.post(
  "/verify-otp",
  validateSchema(VerifyOtpRequestSchema),
  asyncHandler((req, res) => authController.verifyOtp(req, res)),
);

/**
 * POST /api/v1/auth/login
 * Login user with email and password
 */
router.post(
  "/login",
  validateSchema(LoginSchema),
  asyncHandler((req, res) => authController.login(req, res)),
);

/**
 * POST /api/v1/auth/refresh
 * Refresh access token using refresh token
 */
router.post(
  "/refresh",
  asyncHandler((req, res) => authController.refresh(req, res)),
);

/**
 * GET /api/v1/auth/sessions
 * Get all active sessions for the logged in user
 */
router.get(
  "/sessions",
  requireUser,
  sessionMiddleware,
  asyncHandler((req, res) => authController.getSessions(req, res)),
);

/**
 * DELETE /api/v1/auth/sessions/:sessionId
 * Revoke a specific session by ID
 */
router.delete(
  "/sessions/:sessionId",
  requireUser,
  sessionMiddleware,
  asyncHandler((req, res) => authController.revokeSession(req, res)),
);

/**
 * POST /api/v1/auth/logout
 * Logout user from current session
 */
router.post(
  "/logout",
  requireUser,
  sessionMiddleware,
  asyncHandler((req, res) => authController.logout(req, res)),
);

/**
 * POST /api/v1/auth/logout-all
 * Logout user from all sessions
 */
router.post(
  "/logout-all",
  requireUser,
  sessionMiddleware,
  asyncHandler((req, res) => authController.logoutAll(req, res)),
);

export default router;
