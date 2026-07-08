import type {
  AuthResponseDto,
  LoginRequestDto,
  RegisterRequestDto,
  VerifyOtpRequestDto,
  ForgotPasswordRequestDto,
  VerifyResetOtpRequestDto,
  ResetPasswordRequestDto,
} from "@dto";
import type { UserRepository } from "@repository";
import { logger } from "@irctc/logger";
import { statusCode } from "@irctc/http";
import { ERROR_CODES } from "@utils/errors";
import { createHash, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env, redis } from "@config";
import { OtpService } from "./otp.service.js";
import type { OTPRequestedV1Type, UserLoggedInV1Type } from "@irctc/contracts";
import { generateOtp } from "@utils";
import type {
  OtpEventPublisher,
  UserLoggedInEventPublisher,
} from "@publishers";
import { ERROR_CODES as COMMON_ERROR_CODES, ApiError } from "@irctc/errors";
import { AUTH_DURATIONS, REDIS_KEYS } from "@utils/constants";
import { AuthMapper } from "../mappers/auth.mapper.js";
import type { RefreshTokenPayload } from "@middleware";

/**
 * Service handling authentication-related business logic, including registration flows,
 * OTP requests, and password hashing/verification.
 */
export class AuthService {
  constructor(
    private readonly repo: UserRepository,
    private readonly otpPublisher: OtpEventPublisher,
    private readonly loginPublisher: UserLoggedInEventPublisher,
  ) {}

  /**
   * Generates an access token for a user.
   */
  private generateAccessToken(
    userId: string,
    sessionId: string,
    email: string,
  ): string {
    return jwt.sign(
      { sub: userId, email, sessionId, type: "access" },
      env.JWT_SECRET,
      {
        expiresIn: env.JWT_ACCESS_EXPIRES_IN,
      },
    );
  }

  /**
   * Generates a refresh token for a user.
   */
  private generateRefreshToken(userId: string, sessionId: string): string {
    return jwt.sign(
      { sub: userId, sessionId, type: "refresh" },
      env.JWT_SECRET,
      {
        expiresIn: env.JWT_REFRESH_EXPIRES_IN,
      },
    );
  }

  /**
   * Initiates the registration workflow.
   *
   * Workflow:
   * 1. Ensure the email is not already registered.
   * 2. Generate an OTP.
   * 3. Store OTP state in Redis.
   * 4. Store pre-registration data in Redis.
   * 5. Publish OTPRequestedV1 for asynchronous email delivery.
   *
   * The OTP email is sent by Notification Service after consuming the
   * Kafka event. This service never communicates directly with an
   * email provider.
   *
   * Consistency guarantee:
   * If Kafka publishing fails, Redis registration state is rolled back
   * so the user can safely retry registration.
   *
   * @param data Registration request.
   * @returns Registration session identifier.
   *
   * @throws {ApiError}
   * - USER_ALREADY_EXISTS
   * - KAFKA_PUBLISH_FAILED
   */
  async sendOtp(data: RegisterRequestDto): Promise<string> {
    // 1. Check if user already exists to prevent spam/duplicate registrations
    const existingUser = await this.repo.findUserByEmail(data.email);
    if (existingUser) {
      logger.warn(
        { module: "auth" },
        "OTP request failed: User already exists",
      );
      throw new ApiError(statusCode.conflict, ERROR_CODES.USER_ALREADY_EXISTS);
    }

    // 2. Generate and store OTP
    const otp = generateOtp();
    const sessionId = await OtpService.storeOtp(data.email, otp);

    // 3. Hash password and store registration session in Redis
    const hashedPassword = await bcrypt.hash(data.password, 10);
    await OtpService.storeRegistrationSession(sessionId, {
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      hashedPassword,
    });

    // 4. Publish OTPRequestedV1. Roll back on failure so the user can
    // safely retry without leaving a stale registration session.
    const event: OTPRequestedV1Type = {
      eventId: randomUUID(),
      email: data.email,
      otp,
      createdAt: new Date(),
    };

    try {
      await this.otpPublisher.publishOtpRequested(event);
    } catch (err) {
      // Pre-registration flow has no userId; log eventId only.
      logger.error(
        { module: "auth", err, eventId: event.eventId },
        "OTP publish failed; rolling back Redis state",
      );
      await OtpService.deleteRegistrationSession(sessionId);
      throw new ApiError(
        statusCode.badGateway,
        COMMON_ERROR_CODES.KAFKA_PUBLISH_FAILED,
        `Kafka Published Failed for OTP Delivery`,
        { cause: err },
      );
    }

    return sessionId;
  }

  /**
   * Authenticates a user and creates a new device session.
   *
   * Workflow:
   * 1. Validate email and password.
   * 2. Generate access and refresh tokens.
   * 3. Create a Redis-backed session.
   * 4. Track the session for logout-all support.
   * 5. Publish a UserLoggedInV1 event (best effort).
   *
   * Login succeeds even if event publication fails because authentication
   * is considered the primary operation while notifications are secondary.
   *
   * @param data Login credentials.
   * @param fingerprint Device fingerprint used for session binding.
   * @returns Auth response containing user details and JWT tokens.
   *
   * @throws {ApiError}
   * - INVALID_CREDENTIALS
   */
  async login(
    data: LoginRequestDto,
    fingerprint: string,
  ): Promise<AuthResponseDto> {
    // 1. Find user by email
    const user = await this.repo.findUserByEmail(data.email);
    if (!user) {
      logger.warn({ module: "auth" }, "Login failed: User not found");
      throw new ApiError(
        statusCode.unauthorized,
        ERROR_CODES.INVALID_CREDENTIALS,
      );
    }

    // 2. Verify password
    const isPasswordValid = await bcrypt.compare(data.password, user.password);
    if (!isPasswordValid) {
      logger.warn({ module: "auth" }, "Login failed: Invalid password");
      throw new ApiError(
        statusCode.unauthorized,
        ERROR_CODES.INVALID_CREDENTIALS,
      );
    }

    // 3. Generate Session and Tokens
    const sessionId = randomUUID();
    const accessToken = this.generateAccessToken(
      user.id,
      sessionId,
      user.email,
    );
    const refreshToken = this.generateRefreshToken(user.id, sessionId);

    // 4. Hash refresh token for secure storage
    const refreshTokenHash = createHash("sha256")
      .update(refreshToken)
      .digest("hex");

    // 5. Store session in Redis
    const sessionData = {
      userId: user.id,
      fingerprint,
      refreshTokenHash,
      createdAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString(),
      expiresAt: new Date(
        Date.now() + AUTH_DURATIONS.SESSION_TTL_MS,
      ).toISOString(), // 30 days
    };

    // Store session record and track user sessions index atomically
    await redis
      .multi()
      .set(
        REDIS_KEYS.authSession(sessionId),
        JSON.stringify(sessionData),
        "EX",
        AUTH_DURATIONS.SESSION_TTL_SECONDS,
      )
      .sadd(REDIS_KEYS.userSessions(user.id), sessionId)
      .expire(
        REDIS_KEYS.userSessions(user.id),
        AUTH_DURATIONS.SESSION_TTL_SECONDS,
      )
      .exec();

    logger.info(
      { module: "auth", userId: user.id },
      "User logged in successfully",
    );

    /**
     * Best-effort welcome email: the user has already authenticated
     * and the session is persisted already created in Redis.
     * If the Kafka publish fails, we don't want to roll back the
     * login because it would create an inconsistent state for the user.
     * The notification service will handle the event in its own time
     * and will dedupe on eventId if a redelivery ever lands.
     */
    const loginEvent: UserLoggedInV1Type = {
      eventId: randomUUID(),
      userId: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      loggedInAt: new Date(),
    };

    try {
      await this.loginPublisher.publishUserLoggedIn(loginEvent);
    } catch (err) {
      logger.error(
        { module: "auth", err, userId: user.id },
        "Welcome email publish failed; continuing without rollback",
      );
    }

    return AuthMapper.toAuthResponseDto(user, accessToken, refreshToken);
  }

  /**
   * Creates a verified user account and issues initial JWT tokens.
   *
   * This method is only invoked after OTP verification has succeeded.
   * Password hashing has already been completed during the registration
   * initiation phase.
   *
   * @param data Verified registration data.
   * @param sessionId Registration session identifier.
   * @returns Auth response containing issued tokens.
   */
  private async registerUser(
    data: {
      firstName: string;
      lastName: string;
      email: string;
      hashedPassword: string;
    },
    sessionId: string,
  ): Promise<AuthResponseDto> {
    const user = await this.repo.createUser({
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      password: data.hashedPassword,
      emailVerified: true,
    });

    const accessToken = this.generateAccessToken(
      user.id,
      sessionId,
      user.email,
    );
    const refreshToken = this.generateRefreshToken(user.id, sessionId);

    logger.info(
      { module: "auth", userId: user.id },
      "User registered successfully",
    );

    return AuthMapper.toAuthResponseDto(user, accessToken, refreshToken);
  }

  /**
   * Completes registration after successful OTP verification.
   *
   * Workflow:
   * 1. Verify OTP.
   * 2. Load pre-registration data from Redis.
   * 3. Create the user in PostgreSQL.
   * 4. Generate authentication tokens.
   * 5. Remove temporary registration state.
   *
   * Registration cleanup is best effort and does not affect a
   * successful registration response.
   *
   * @param sessionId Registration session identifier.
   * @param data OTP verification request.
   * @returns Auth response containing issued tokens.
   *
   * @throws {ApiError}
   * - REGISTRATION_SESSION_EXPIRED
   */
  async verifyAndRegister(
    sessionId: string,
    data: VerifyOtpRequestDto,
  ): Promise<AuthResponseDto> {
    // 1. Verify OTP
    await OtpService.verifyOtp(sessionId, data.otp);

    // 2. Retrieve registration data from Redis
    const regData = await OtpService.getRegistrationSession(sessionId);
    if (!regData) {
      logger.warn(
        { module: "auth" },
        "Registration session expired or missing",
      );
      throw new ApiError(
        statusCode.notFound,
        ERROR_CODES.REGISTRATION_SESSION_EXPIRED,
      );
    }

    // 3. Execute registration using stored data
    const authResponse = await this.registerUser(regData, sessionId);

    // 4. Clean up sessions (best-effort; do not fail completed registration)
    try {
      await OtpService.deleteRegistrationSession(sessionId);
    } catch (error) {
      logger.warn({ module: "auth", error }, "Session cleanup failed");
    }

    return authResponse;
  }

  /**
   * Issues a new access token and refresh token for an existing session.
   *
   * Security protections:
   * - Session existence validation
   * - Device fingerprint verification
   * - Refresh token rotation
   * - Refresh token reuse detection
   *
   * If refresh token reuse is detected, all active sessions belonging to
   * the user are revoked as a defensive security measure.
   *
   * @param refreshToken Existing refresh token.
   * @param fingerprint Device fingerprint associated with the session.
   * @returns Newly issued access and refresh tokens.
   *
   * @throws {ApiError}
   * - INVALID_REFRESH_TOKEN
   * - SESSION_EXPIRED_OR_REVOKED
   * - DEVICE_FINGERPRINT_MISMATCH
   */
  async refresh(
    refreshToken: string,
    fingerprint: string,
  ): Promise<AuthResponseDto> {
    try {
      const decoded = jwt.verify(
        refreshToken,
        env.JWT_SECRET,
      ) as RefreshTokenPayload;
      const { sub: userId, sessionId } = decoded;

      if (decoded.type !== "refresh") {
        throw new ApiError(
          statusCode.unauthorized,
          ERROR_CODES.INVALID_TOKEN_TYPE,
        );
      }

      // 1. Load session from Redis
      const sessionKey = REDIS_KEYS.authSession(sessionId);
      const sessionJson = await redis.get(sessionKey);
      if (!sessionJson) {
        logger.warn(
          { module: "auth", sessionId },
          "Refresh token rotation failed: Session not found",
        );
        throw new ApiError(
          statusCode.unauthorized,
          ERROR_CODES.SESSION_EXPIRED_OR_REVOKED,
        );
      }

      const session = JSON.parse(sessionJson);

      // 2. Verify Fingerprint
      if (session.fingerprint !== fingerprint) {
        logger.warn(
          { module: "auth", userId },
          "Fingerprint mismatch detected",
        );
        await this.logout(sessionId, userId);
        throw new ApiError(
          statusCode.unauthorized,
          ERROR_CODES.DEVICE_FINGERPRINT_MISMATCH,
        );
      }

      // 3. Hash incoming refresh token and compare (Reuse Detection)
      const incomingHash = createHash("sha256")
        .update(refreshToken)
        .digest("hex");

      if (session.refreshTokenHash !== incomingHash) {
        logger.error(
          { module: "auth", userId },
          "Refresh token reuse detected! Revoking all sessions.",
        );
        await this.logoutAll(userId);
        throw new ApiError(
          statusCode.unauthorized,
          ERROR_CODES.REFRESH_TOKEN_INVALID,
        );
      }

      // 4. Generate NEW tokens (Rotation)
      const user = await this.repo.findById(userId);
      if (!user)
        throw new ApiError(statusCode.notFound, ERROR_CODES.USER_NOT_FOUND);

      const accessToken = this.generateAccessToken(
        user.id,
        sessionId,
        user.email,
      );
      const newRefreshToken = this.generateRefreshToken(user.id, sessionId);
      const newRefreshTokenHash = createHash("sha256")
        .update(newRefreshToken)
        .digest("hex");

      // 5. Update session in Redis
      session.refreshTokenHash = newRefreshTokenHash;
      session.lastUsedAt = new Date().toISOString();

      await redis.set(
        sessionKey,
        JSON.stringify(session),
        "EX",
        AUTH_DURATIONS.SESSION_TTL_SECONDS,
      );

      logger.info({ module: "auth", userId }, "Token refreshed successfully");
      return AuthMapper.toAuthResponseDto(user, accessToken, newRefreshToken);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(
        statusCode.unauthorized,
        ERROR_CODES.INVALID_REFRESH_TOKEN,
      );
    }
  }

  /**
   * Retrieves all active sessions belonging to a user.
   *
   * Sensitive fields such as refresh token hashes are excluded
   * from the returned payload.
   *
   * @param userId User identifier.
   * @returns Active session metadata.
   */
  async getSessions(userId: string): Promise<any[]> {
    const sessionsKey = REDIS_KEYS.userSessions(userId);
    const sessionIds = await redis.smembers(sessionsKey);

    const sessions = await Promise.all(
      sessionIds.map(async (id) => {
        const data = await redis.get(REDIS_KEYS.authSession(id));
        if (!data) return null;
        const parsed = JSON.parse(data);
        // exclude sensitive data from response (refresh token hash)
        const { refreshTokenHash, ...safeSession } = parsed;
        return { sessionId: id, ...safeSession };
      }),
    );

    return sessions.filter(Boolean);
  }

  /**
   * Revokes a specific session owned by the user.
   *
   * Ownership validation is performed before deletion to prevent
   * one user from revoking another user's session.
   *
   * @param sessionId Session identifier.
   * @param userId Current authenticated user.
   *
   * @throws {ApiError}
   * - SESSION_OWNERSHIP_INVALID
   */
  async revokeSession(sessionId: string, userId: string): Promise<void> {
    const sessionKey = REDIS_KEYS.authSession(sessionId);
    const sessionJson = await redis.get(sessionKey);

    if (!sessionJson) return;

    const session = JSON.parse(sessionJson);
    if (session.userId !== userId) {
      logger.warn(
        { module: "auth", userId, ownerId: session.userId },
        "Unauthorized session revocation attempt",
      );
      throw new ApiError(
        statusCode.forbidden,
        ERROR_CODES.SESSION_OWNERSHIP_INVALID,
      );
    }

    await redis.del(sessionKey);
    await redis.srem(REDIS_KEYS.userSessions(userId), sessionId);
    logger.info({ module: "auth", userId }, "Session revoked");
  }

  /**
   * Logs out the current device by removing the associated session.
   *
   * Both the session record and the user's session index
   * are cleaned up from Redis.
   *
   * @param sessionId Session identifier.
   * @param userId User identifier.
   */
  async logout(sessionId: string, userId: string): Promise<void> {
    logger.info({ module: "auth", userId }, "Logging out current device");

    await redis.del(REDIS_KEYS.authSession(sessionId));
    await redis.srem(REDIS_KEYS.userSessions(userId), sessionId);

    logger.info({ module: "auth", userId }, "Session deleted successfully");
  }

  /**
   * Revokes every active session belonging to the user.
   *
   * This operation is used for:
   * - Explicit logout-all requests
   * - Refresh token reuse detection
   * - Security incident response
   *
   * @param userId User identifier.
   */
  async logoutAll(userId: string): Promise<void> {
    logger.info({ module: "auth", userId }, "Logging out all devices");

    const sessionsKey = REDIS_KEYS.userSessions(userId);
    const sessions = await redis.smembers(sessionsKey);

    if (sessions.length > 0) {
      const sessionKeys = sessions.map((id) => REDIS_KEYS.authSession(id));
      await redis.del(...sessionKeys);
    }

    await redis.del(sessionsKey);

    logger.info(
      { module: "auth", userId, sessionCount: sessions.length },
      "All user sessions deleted",
    );
  }

  /**
   * Initiates the forgot password workflow.
   *
   * Workflow:
   * 1. Validate that the email is associated with an existing user.
   * 2. Generate a random 6-digit OTP.
   * 3. Store the OTP in Redis via OtpService (rate-limited).
   * 4. Save the forgot password email session in Redis.
   * 5. Publish an OTPRequestedV1 event to Kafka for async dispatch.
   *
   * @param data - Forgot password request DTO containing the user's email.
   * @returns A promise resolving to the password reset session ID.
   * @throws {ApiError}
   * - USER_NOT_FOUND
   * - KAFKA_PUBLISH_FAILED
   */
  async forgotPassword(data: ForgotPasswordRequestDto): Promise<string> {
    const user = await this.repo.findUserByEmail(data.email);
    if (!user) {
      logger.warn(
        { module: "auth" },
        "Forgot password request failed: User not found",
      );
      throw new ApiError(statusCode.notFound, ERROR_CODES.USER_NOT_FOUND);
    }

    const otp = generateOtp();
    const sessionId = await OtpService.storeOtp(data.email, otp);

    // Save the email associated with the session in Redis
    await redis.set(
      REDIS_KEYS.forgotPasswordSession(sessionId),
      data.email,
      "EX",
      env.OTP_TTL,
    );

    const event: OTPRequestedV1Type = {
      eventId: randomUUID(),
      email: data.email,
      otp,
      createdAt: new Date(),
    };

    try {
      await this.otpPublisher.publishOtpRequested(event);
    } catch (err) {
      logger.error(
        { module: "auth", err, eventId: event.eventId },
        "Forgot password OTP publish failed; rolling back Redis state",
      );
      await redis.del(
        REDIS_KEYS.otp(sessionId),
        REDIS_KEYS.forgotPasswordSession(sessionId),
      );
      throw new ApiError(
        statusCode.badGateway,
        COMMON_ERROR_CODES.KAFKA_PUBLISH_FAILED,
        `Kafka Published Failed for Forgot Password OTP Delivery`,
        { cause: err },
      );
    }

    return sessionId;
  }

  /**
   * Verifies the OTP sent for password reset and issues a temporary token.
   *
   * Workflow:
   * 1. Retrieve the email linked to the session from Redis.
   * 2. Verify the OTP using OtpService.
   * 3. Issue a short-lived random password reset token (10 minutes).
   * 4. Clean up the verification OTP and session from Redis.
   *
   * @param data - The session ID and OTP.
   * @returns A promise resolving to the password reset token.
   * @throws {ApiError}
   * - OTP_SESSION_NOT_FOUND
   * - OTP_INVALID or OTP_LOCKED
   */
  async verifyResetOtp(data: VerifyResetOtpRequestDto): Promise<string> {
    const email = await redis.get(
      REDIS_KEYS.forgotPasswordSession(data.sessionId),
    );
    if (!email) {
      logger.warn(
        { module: "auth", sessionId: data.sessionId },
        "OTP verification failed: forgot password session not found or expired",
      );
      throw new ApiError(
        statusCode.unauthorized,
        ERROR_CODES.OTP_SESSION_NOT_FOUND,
        "Forgot password session not found or expired",
      );
    }

    // Verify OTP (throws if invalid or locked due to excess attempts)
    await OtpService.verifyOtp(data.sessionId, data.otp);

    // Generate short-lived password reset token
    const token = randomUUID();
    await redis.set(
      REDIS_KEYS.passwordResetToken(token),
      email,
      "EX",
      AUTH_DURATIONS.PASSWORD_RESET_TOKEN_TTL_SECONDS,
    );

    // Clean up OTP session data since OTP has been verified
    await redis.del(
      REDIS_KEYS.otp(data.sessionId),
      REDIS_KEYS.forgotPasswordSession(data.sessionId),
    );

    logger.info(
      { module: "auth", sessionId: data.sessionId },
      "OTP verified, reset token issued",
    );
    return token;
  }

  /**
   * Completes the forgot password workflow by resetting the user's password.
   *
   * Workflow:
   * 1. Retrieve the email linked to the password reset token from Redis.
   * 2. Hash the new password and update the database record.
   * 3. Revoke all active sessions for the user as a security measure.
   * 4. Clean up the password reset token from Redis.
   *
   * @param data - Reset password request DTO containing the reset token and new password.
   * @throws {ApiError}
   * - OTP_SESSION_NOT_FOUND
   * - USER_NOT_FOUND
   */
  async resetPassword(data: ResetPasswordRequestDto): Promise<void> {
    const email = await redis.get(
      REDIS_KEYS.passwordResetToken(data.passwordResetToken),
    );
    if (!email) {
      logger.warn(
        { module: "auth", token: data.passwordResetToken },
        "Password reset failed: reset token not found or expired",
      );
      throw new ApiError(
        statusCode.unauthorized,
        ERROR_CODES.OTP_SESSION_NOT_FOUND,
        "Password reset token is invalid or has expired",
      );
    }

    const user = await this.repo.findUserByEmail(email);
    if (!user) {
      throw new ApiError(statusCode.notFound, ERROR_CODES.USER_NOT_FOUND);
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);
    await this.repo.update(user.id, { password: hashedPassword });

    // Revoke all existing active sessions for security
    await this.logoutAll(user.id);

    // Clean up reset token
    await redis.del(REDIS_KEYS.passwordResetToken(data.passwordResetToken));

    logger.info(
      { module: "auth", userId: user.id },
      "Password reset successfully and active sessions revoked",
    );
  }
}
