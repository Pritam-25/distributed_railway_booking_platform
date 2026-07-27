import type { AuthService } from "@services";
import type { RefreshTokenPayload } from "@irctc/middleware";
import type {
  LoginRequestDto,
  RegisterRequestDto,
  VerifyOtpRequestDto,
  ForgotPasswordRequestDto,
  VerifyPasswordResetOtpRequestDto,
  ResetPasswordRequestDto,
  SessionSummaryDto,
  ActiveSessionDto,
} from "@dto";
import { logger } from "@irctc/logger";
import { env } from "@config";
import { COOKIE_MAX_AGE, COOKIE_NAMES } from "@utils/constants";
import { statusCode, successResponse } from "@irctc/http";
import type { Response, Request } from "express";
import { getDeviceFingerprint } from "@utils";
import { ApiError } from "@irctc/errors";
import { ERROR_CODES } from "@utils/errors";
import jwt from "jsonwebtoken";

/**
 * Controller handling authentication, session management, and password recovery HTTP requests.
 */
export class AuthController {
  /**
   * Creates an instance of AuthController.
   * @param service - The AuthService instance.
   */
  constructor(private readonly service: AuthService) {}

  /**
   * Sets a secure HTTP-only cookie on the Express Response.
   *
   * @param res - The Express Response object.
   * @param name - The name of the cookie.
   * @param value - The value to store in the cookie.
   * @param maxAge - The expiration time of the cookie in milliseconds.
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
   * HTTP endpoint to initiate user registration by sending an OTP.
   * Generates an OTP session, stores registration state in Redis, sets a short-lived
   * HTTP-only `otp_session` cookie, and sends an email via Kafka notification event.
   *
   * @param req - The Express Request object containing user registration details in body.
   * @param res - The Express Response object used to set the OTP session cookie and JSON data.
   * @returns A promise that resolves when the response is sent.
   */
  async sendOtp(req: Request, res: Response): Promise<void> {
    const payload = req.body as RegisterRequestDto;
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
   * HTTP endpoint to verify registration OTP and complete account creation.
   * Validates OTP against stored Redis session, creates user in PostgreSQL, creates active
   * authentication session in Redis, sets `access_token` and `refresh_token` HTTP-only cookies,
   * clears `otp_session` cookie, and publishes `UserRegisteredV1` Kafka event.
   *
   * @param req - The Express Request object containing OTP body and `otp_session` cookie.
   * @param res - The Express Response object used to set authentication cookies and return user data.
   * @returns A promise that resolves when the response is sent.
   * @throws {ApiError} - If `otp_session` cookie is missing (400) or OTP verification fails (400/401).
   */
  async verifyOtp(req: Request, res: Response): Promise<void> {
    const sessionId = req.cookies[COOKIE_NAMES.OTP_SESSION];
    if (!sessionId) {
      throw new ApiError(
        statusCode.badRequest,
        ERROR_CODES.OTP_SESSION_NOT_FOUND,
      );
    }

    const payload = req.body as VerifyOtpRequestDto;
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

    // Clear the OTP session cookie after successful registration
    res.clearCookie(COOKIE_NAMES.OTP_SESSION, { path: "/" });

    res
      .status(statusCode.created)
      .json(successResponse("Registration successful", authResponse.user));
  }

  /**
   * HTTP endpoint to authenticate an existing user with email and password.
   * Validates credentials against bcrypt password hash in PostgreSQL, creates a new active session
   * in Redis, sets HTTP-only `access_token` and `refresh_token` cookies, and publishes `UserLoggedInV1` event.
   *
   * @param req - The Express Request object containing email and password in body.
   * @param res - The Express Response object used to set authentication cookies and return user data.
   * @returns A promise that resolves when the response is sent.
   * @throws {ApiError} - If user is not found or password validation fails (401 INVALID_CREDENTIALS).
   */
  async login(req: Request, res: Response): Promise<void> {
    const payload = req.body as LoginRequestDto;
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
   * HTTP endpoint to refresh access and refresh tokens via Refresh Token Rotation (RTR).
   *
   * Security & Recovery Workflow:
   * 1. Reads the HTTP-only `refresh_token` cookie.
   * 2. Validates the session, token, and device context from Redis.
   * 3. Issues a new rotated access/refresh token pair on success.
   * 4. Clears authentication cookies and returns `401` if refresh fails.
   *
   * @param req - Express request containing the refresh token cookie.
   * @param res - Express response used to set or clear authentication cookies.
   * @returns A promise that resolves when the response is sent.
   * @throws {ApiError} If the refresh token is missing, invalid, expired, revoked, or reused.
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
   * HTTP endpoint to retrieve all active sessions for the currently authenticated user.
   * Queries active session keys from Redis and marks `isCurrent: true` for the requesting device session.
   *
   * @param req - The Express Request object containing authenticated user claims attached by middleware.
   * @param res - The Express Response object used to return active session objects.
   * @returns A promise that resolves when the response is sent.
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
   * HTTP endpoint to revoke a specific active device session by session ID.
   * Validates session ownership, deletes the session key from Redis, and updates the user's session index.
   *
   * @param req - The Express Request object containing `sessionId` parameter and user claims.
   * @param res - The Express Response object used to return success response.
   * @returns A promise that resolves when the response is sent.
   * @throws {ApiError} - If `sessionId` param is missing or session does not belong to requesting user.
   */
  async revokeSession(req: Request, res: Response): Promise<void> {
    const { sessionId } = req.params;
    const userId = req.user!.userId;

    if (!sessionId) {
      throw new ApiError(
        statusCode.badRequest,
        ERROR_CODES.SESSION_ID_REQUIRED,
      );
    }

    await this.service.revokeSession(sessionId, userId);

    res
      .status(statusCode.success)
      .json(successResponse("Session revoked successfully", {}));
  }

  /**
   * HTTP endpoint to log out the current device session.
   * Decodes refresh token, deletes the corresponding session key from Redis, and explicitly sends
   * `Set-Cookie` clearance headers (`Max-Age=0`) for both `access_token` and `refresh_token`.
   *
   * @param req - The Express Request object containing current `refresh_token` cookie.
   * @param res - The Express Response object used to issue cookie clearance headers.
   * @returns A promise that resolves when the response is sent.
   */
  async logout(req: Request, res: Response): Promise<void> {
    const refreshToken = req.cookies[COOKIE_NAMES.REFRESH_TOKEN];

    if (refreshToken) {
      let decoded: RefreshTokenPayload | undefined;
      try {
        decoded = jwt.verify(
          refreshToken,
          env.JWT_SECRET,
        ) as RefreshTokenPayload;
      } catch {
        // Expired or invalid refresh token on logout is handled silently
      }

      if (decoded?.type === "refresh" && decoded.sub && decoded.sessionId) {
        try {
          await this.service.logout(decoded.sessionId, decoded.sub);
        } catch (err) {
          logger.error(
            { module: "auth", err },
            "Session revocation failed during logout",
          );
        }
      }
    }

    res.clearCookie(COOKIE_NAMES.ACCESS_TOKEN, { path: "/" });
    res.clearCookie(COOKIE_NAMES.REFRESH_TOKEN, { path: "/" });

    res
      .status(statusCode.success)
      .json(successResponse("Logged out successfully", {}));
  }

  /**
   * HTTP endpoint to log out all active device sessions for the authenticated user.
   * Deletes all session keys associated with the user in Redis, clears the session index,
   * and issues `Set-Cookie` clearance headers for all authentication cookies.
   *
   * @param req - The Express Request object containing `refresh_token` cookie.
   * @param res - The Express Response object used to issue cookie clearance headers.
   * @returns A promise that resolves when the response is sent.
   */
  async logoutAll(req: Request, res: Response): Promise<void> {
    const refreshToken = req.cookies[COOKIE_NAMES.REFRESH_TOKEN];

    if (refreshToken) {
      let decoded: RefreshTokenPayload | undefined;
      try {
        decoded = jwt.verify(
          refreshToken,
          env.JWT_SECRET,
        ) as RefreshTokenPayload;
      } catch {
        // Expired or invalid refresh token on logout-all is handled silently
      }

      if (decoded?.type === "refresh" && decoded.sub) {
        try {
          await this.service.logoutAll(decoded.sub);
        } catch (err) {
          logger.error(
            { module: "auth", err },
            "Session revocation failed during logoutAll",
          );
        }
      }
    }

    res.clearCookie(COOKIE_NAMES.ACCESS_TOKEN, { path: "/" });
    res.clearCookie(COOKIE_NAMES.REFRESH_TOKEN, { path: "/" });

    res
      .status(statusCode.success)
      .json(successResponse("Logged out from all devices", {}));
  }

  /**
   * HTTP endpoint to initiate password recovery by sending a reset OTP.
   * Generates a password reset session in Redis, dispatches reset OTP via Kafka notification event,
   * and returns a `sessionId` for the subsequent verification step.
   *
   * @param req - The Express Request object containing registered email address in body.
   * @param res - The Express Response object used to return reset `sessionId`.
   * @returns A promise that resolves when the response is sent.
   */
  async forgotPassword(req: Request, res: Response): Promise<void> {
    const data = req.body as ForgotPasswordRequestDto;
    const { sessionId } = await this.service.forgotPassword(data);

    res.status(statusCode.success).json(
      successResponse("OTP sent successfully to your registered email", {
        sessionId,
      }),
    );
  }

  /**
   * HTTP endpoint to verify a password reset OTP.
   * Validates OTP code against stored reset session in Redis, consumes OTP to prevent replay,
   * and issues a short-lived, single-use `passwordResetToken`.
   *
   * @param req - The Express Request object containing reset `sessionId` and OTP in body.
   * @param res - The Express Response object used to return `passwordResetToken`.
   * @returns A promise that resolves when the response is sent.
   * @throws {ApiError} - If OTP is invalid, expired, or locked due to too many failed attempts.
   */
  async VerifyPasswordResetOtp(req: Request, res: Response): Promise<void> {
    const data = req.body as VerifyPasswordResetOtpRequestDto;
    const { passwordResetToken } =
      await this.service.VerifyPasswordResetOtp(data);

    res
      .status(statusCode.success)
      .json(
        successResponse("OTP verified successfully", { passwordResetToken }),
      );
  }

  /**
   * HTTP endpoint to reset user password using a verified password reset token.
   * Validates token signature, updates bcrypt password hash in PostgreSQL, revokes all existing Redis sessions,
   * and clears all active authentication cookies forcing a fresh login.
   *
   * @param req - The Express Request object containing `passwordResetToken` and new password in body.
   * @param res - The Express Response object used to issue cookie clearance headers and return response.
   * @returns A promise that resolves when the response is sent.
   * @throws {ApiError} - If `passwordResetToken` is invalid or expired.
   */
  async resetPassword(req: Request, res: Response): Promise<void> {
    const data = req.body as ResetPasswordRequestDto;
    await this.service.resetPassword(data);

    // Clear authentication cookies upon successful password reset
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
