import type { AuthService } from "@services";
import {
  type LoginRequestDto,
  type RegisterRequestDto,
  type VerifyOtpRequestDto,
  type ForgotPasswordRequestDto,
  type VerifyPasswordResetOtpRequestDto,
  type ResetPasswordRequestDto,
  type SessionSummaryDto,
  type ActiveSessionDto,
  SessionParamSchema,
} from "@dto";
import { COOKIE_MAX_AGE, COOKIE_NAMES } from "@utils/constants";
import { env } from "@config";
import { statusCode, successResponse } from "@irctc/http";
import type { Response, Request } from "express";
import { getDeviceFingerprint } from "@utils";
import { ApiError } from "@irctc/errors";
import { ERROR_CODES } from "@utils/errors";
import { z } from "zod";

/**
 * ## AuthController
 *
 * Thin HTTP adapter for authentication, session management, and password
 * recovery endpoints.
 *
 * ### Responsibilities
 * - Accepts schema-validated HTTP requests for authentication flows.
 * - Manages HTTP-only authentication cookies (`access_token`,
 *   `refresh_token`, `otp_session`).
 * - Extracts device metadata (fingerprint, IP, User-Agent) from incoming
 *   requests.
 * - Delegates all core domain logic to {@link AuthService}.
 * - Envelopes service results in standard {@link successResponse} payloads.
 *
 * ### Error Handling
 * - Delegates exception handling to `asyncHandler` and global error middleware.
 * - `refresh` explicitly catches errors to clear HTTP-only cookies on failure before re-throwing, ensuring the frontend never gets trapped in an infinite refresh loop.
 */
export class AuthController {
  /**
   * Creates an instance of AuthController.
   *
   * @param service - Injected {@link AuthService} instance.
   */
  constructor(private readonly service: AuthService) {}

  /**
   * Sets a secure HTTP-only cookie on the Express Response.
   *
   * @param res - Express Response object.
   * @param name - Cookie name.
   * @param value - Value stored in the cookie.
   * @param maxAge - Expiration time in milliseconds.
   */
  private setCookie(
    res: Response,
    name: string,
    value: string,
    maxAge: number,
  ) {
    res.cookie(name, value, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge,
      path: "/",
    });
  }

  /**
   * Initiates user registration by sending an OTP to the user's email.
   *
   * `POST /api/v1/auth/send-otp`
   *
   * ### Access
   * Public
   *
   * ### Cookies
   * Sets HTTP-only `otp_session` cookie.
   *
   * @param req - Express request with validated {@link RegisterRequestDto} body.
   * @param res - Express response object.
   */
  async sendOtp(req: Request, res: Response): Promise<void> {
    const payload: RegisterRequestDto = req.body;
    const sessionId = await this.service.sendOtp(payload);

    this.setCookie(
      res,
      COOKIE_NAMES.OTP_SESSION,
      sessionId,
      env.REGISTRATION_OTP_TTL * 1000,
    );

    res
      .status(statusCode.success)
      .json(successResponse("OTP sent to your email successfully", {}));
  }

  /**
   * Verifies the registration OTP and completes account creation.
   *
   * `POST /api/v1/auth/verify-otp`
   *
   * ### Access
   * Public (Requires `otp_session` cookie)
   *
   * ### Cookies
   * - Clears: `otp_session`
   * - Sets: `access_token`, `refresh_token`
   *
   * @param req - Express request with validated {@link VerifyOtpRequestDto} body.
   * @param res - Express response object.
   */
  async verifyOtp(req: Request, res: Response): Promise<void> {
    const sessionId = req.cookies[COOKIE_NAMES.OTP_SESSION];
    if (!sessionId) {
      throw new ApiError(
        statusCode.badRequest,
        ERROR_CODES.OTP_SESSION_NOT_FOUND,
      );
    }

    const payload: VerifyOtpRequestDto = req.body;
    const fingerprint = getDeviceFingerprint(req);
    const authResponse = await this.service.verifyAndRegister(
      sessionId,
      payload,
      fingerprint,
      req.ip,
      req.headers["user-agent"],
    );

    this.setCookie(
      res,
      COOKIE_NAMES.ACCESS_TOKEN,
      authResponse.tokens.accessToken,
      COOKIE_MAX_AGE.ACCESS_TOKEN,
    );
    this.setCookie(
      res,
      COOKIE_NAMES.REFRESH_TOKEN,
      authResponse.tokens.refreshToken,
      COOKIE_MAX_AGE.REFRESH_TOKEN,
    );

    res.clearCookie(COOKIE_NAMES.OTP_SESSION, { path: "/" });

    res
      .status(statusCode.created)
      .json(successResponse("Registration successful", authResponse.user));
  }

  /**
   * Authenticates an existing user with email and password credentials.
   *
   * `POST /api/v1/auth/login`
   *
   * ### Access
   * Public
   *
   * ### Cookies
   * Sets HTTP-only `access_token` and `refresh_token`.
   *
   * @param req - Express request with validated {@link LoginRequestDto} body.
   * @param res - Express response object.
   */
  async login(req: Request, res: Response): Promise<void> {
    const payload: LoginRequestDto = req.body;
    const fingerprint = getDeviceFingerprint(req);

    const authResponse = await this.service.login(
      payload,
      fingerprint,
      req.ip,
      req.headers["user-agent"],
    );

    this.setCookie(
      res,
      COOKIE_NAMES.ACCESS_TOKEN,
      authResponse.tokens.accessToken,
      COOKIE_MAX_AGE.ACCESS_TOKEN,
    );
    this.setCookie(
      res,
      COOKIE_NAMES.REFRESH_TOKEN,
      authResponse.tokens.refreshToken,
      COOKIE_MAX_AGE.REFRESH_TOKEN,
    );

    res
      .status(statusCode.success)
      .json(successResponse("Login successful", authResponse.user));
  }

  /**
   * Refreshes access and refresh tokens via Refresh Token Rotation (RTR).
   *
   * `POST /api/v1/auth/refresh`
   *
   * ### Access
   * Authenticated (Requires `refresh_token` cookie)
   *
   * ### Cookies
   * Rotates HTTP-only `access_token` and `refresh_token` cookies on success.
   *
   * Clears both cookies on failure to prevent frontend **infinite refresh** loops.
   *
   * @param req - Express request containing the `refresh_token` cookie.
   * @param res - Express response object.
   */
  async refresh(req: Request, res: Response): Promise<void> {
    const refreshToken = req.cookies[COOKIE_NAMES.REFRESH_TOKEN];

    if (!refreshToken) {
      res.clearCookie(COOKIE_NAMES.ACCESS_TOKEN, { path: "/" });
      res.clearCookie(COOKIE_NAMES.REFRESH_TOKEN, { path: "/" });
      throw new ApiError(
        statusCode.unauthorized,
        ERROR_CODES.REFRESH_TOKEN_MISSING,
      );
    }

    try {
      const fingerprint = getDeviceFingerprint(req);
      const authResponse = await this.service.refresh(
        refreshToken,
        fingerprint,
      );

      this.setCookie(
        res,
        COOKIE_NAMES.ACCESS_TOKEN,
        authResponse.tokens.accessToken,
        COOKIE_MAX_AGE.ACCESS_TOKEN,
      );
      this.setCookie(
        res,
        COOKIE_NAMES.REFRESH_TOKEN,
        authResponse.tokens.refreshToken,
        COOKIE_MAX_AGE.REFRESH_TOKEN,
      );

      res
        .status(statusCode.success)
        .json(
          successResponse("Token refreshed successfully", authResponse.user),
        );
    } catch (err) {
      res.clearCookie(COOKIE_NAMES.ACCESS_TOKEN, { path: "/" });
      res.clearCookie(COOKIE_NAMES.REFRESH_TOKEN, { path: "/" });
      throw err;
    }
  }

  /**
   * Retrieves all active sessions for the currently authenticated user.
   *
   * `GET /api/v1/auth/sessions`
   *
   * ### Access
   * Authenticated
   *
   * @param req - Express request with user claims attached by auth middleware.
   * @param res - Express response returning active session list with
   *   `isCurrent` flag set on the current device session.
   */
  async getSessions(req: Request, res: Response): Promise<void> {
    const userId = req.user!.userId;
    const currentSessionId = req.user!.sessionId;
    const sessions: SessionSummaryDto[] =
      await this.service.getSessions(userId);

    const sessionsWithCurrent: ActiveSessionDto[] = sessions.map((session) => ({
      ...session,
      isCurrent: session.sessionId === currentSessionId,
    }));

    res
      .status(statusCode.success)
      .json(
        successResponse(
          "Active sessions retrieved successfully",
          sessionsWithCurrent,
        ),
      );
  }

  /**
   * Revokes a specific active device session by session ID.
   *
   * `DELETE /api/v1/auth/sessions/:sessionId`
   *
   * ### Access
   * Authenticated
   *
   * @param req - Express request containing `sessionId` path parameter and
   *   user claims attached by auth middleware.
   * @param res - Express response object.
   */
  async revokeSession(req: Request, res: Response): Promise<void> {
    const { sessionId } = z.parse(SessionParamSchema, req.params);
    const userId = req.user!.userId;

    await this.service.revokeSession(sessionId, userId);

    res
      .status(statusCode.success)
      .json(successResponse("Session revoked successfully", {}));
  }

  /**
   * Logs out the current device session and clears authentication cookies.
   *
   * `POST /api/v1/auth/logout`
   *
   * ### Access
   * Authenticated
   *
   * ### Cookies
   * Clears HTTP-only `access_token` and `refresh_token`.
   *
   * @param req - Express request containing the current `refresh_token` cookie.
   * @param res - Express response object.
   */
  async logout(req: Request, res: Response): Promise<void> {
    // 1. Delegate session revocation to AuthService (best-effort)
    const refreshToken = req.cookies[COOKIE_NAMES.REFRESH_TOKEN];
    await this.service.logoutByRefreshToken(refreshToken);

    // 2. Clear HTTP-only authentication cookies
    res.clearCookie(COOKIE_NAMES.ACCESS_TOKEN, { path: "/" });
    res.clearCookie(COOKIE_NAMES.REFRESH_TOKEN, { path: "/" });

    res
      .status(statusCode.success)
      .json(successResponse("Logged out successfully", {}));
  }

  /**
   * Revokes all active device sessions for the authenticated user.
   *
   * `POST /api/v1/auth/logout-all`
   *
   * ### Access
   * Authenticated
   *
   * ### Cookies
   * Clears HTTP-only `access_token` and `refresh_token`.
   *
   * @param req - Express request containing the current `refresh_token` cookie.
   * @param res - Express response object.
   */
  async logoutAll(req: Request, res: Response): Promise<void> {
    // 1. Delegate all-session revocation to AuthService (best-effort)
    const refreshToken = req.cookies[COOKIE_NAMES.REFRESH_TOKEN];
    await this.service.logoutAllByRefreshToken(refreshToken);

    // 2. Clear HTTP-only authentication cookies
    res.clearCookie(COOKIE_NAMES.ACCESS_TOKEN, { path: "/" });
    res.clearCookie(COOKIE_NAMES.REFRESH_TOKEN, { path: "/" });

    res
      .status(statusCode.success)
      .json(successResponse("Logged out from all devices", {}));
  }

  /**
   * Initiates password recovery by sending a reset OTP to the user's
   * registered email.
   *
   * `POST /api/v1/auth/forgot-password`
   *
   * ### Access
   * Public
   *
   * @param req - Express request with validated {@link ForgotPasswordRequestDto}
   *   body.
   * @param res - Express response returning the reset `sessionId`.
   */
  async forgotPassword(req: Request, res: Response): Promise<void> {
    const data: ForgotPasswordRequestDto = req.body;
    const { sessionId } = await this.service.forgotPassword(data);

    res.status(statusCode.success).json(
      successResponse("OTP sent successfully to your registered email", {
        sessionId,
      }),
    );
  }

  /**
   * Verifies a password reset OTP and issues a single-use password reset token.
   *
   * `POST /api/v1/auth/verify-reset-otp`
   *
   * ### Access
   * Public
   *
   * @param req - Express request with validated
   *   {@link VerifyPasswordResetOtpRequestDto} body.
   * @param res - Express response returning the issued `passwordResetToken`.
   */
  async VerifyPasswordResetOtp(req: Request, res: Response): Promise<void> {
    const data: VerifyPasswordResetOtpRequestDto = req.body;
    const { passwordResetToken } =
      await this.service.VerifyPasswordResetOtp(data);

    res
      .status(statusCode.success)
      .json(
        successResponse("OTP verified successfully", { passwordResetToken }),
      );
  }

  /**
   * Resets the user password using a verified password reset token.
   *
   * `POST /api/v1/auth/reset-password`
   *
   * ### Access
   * Public
   *
   * ### Cookies
   * Clears HTTP-only `access_token` and `refresh_token`.
   *
   * @param req - Express request with validated {@link ResetPasswordRequestDto}
   *   body.
   * @param res - Express response object.
   */
  async resetPassword(req: Request, res: Response): Promise<void> {
    const data: ResetPasswordRequestDto = req.body;
    await this.service.resetPassword(data);

    res.clearCookie(COOKIE_NAMES.ACCESS_TOKEN, { path: "/" });
    res.clearCookie(COOKIE_NAMES.REFRESH_TOKEN, { path: "/" });

    res
      .status(statusCode.success)
      .json(
        successResponse(
          "Password reset successfully. Please login with your new credentials.",
          {},
        ),
      );
  }
}
