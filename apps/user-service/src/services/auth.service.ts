import type {
  AuthResponseDto,
  LoginRequestDto,
  RegisterRequestDto,
  UserResponseDto,
  VerifyOtpRequestDto,
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
import { UserMapper } from "@mappers";
import { AuthMapper } from "../mappers/auth.mapper.js";

export interface AccessTokenPayload {
  sub: string;
  email: string;
  sessionId: string;
  type: "access";
}

export interface RefreshTokenPayload {
  sub: string;
  sessionId: string;
  type: "refresh";
}

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

    await redis.set(
      REDIS_KEYS.authSession(sessionId),
      JSON.stringify(sessionData),
      "EX",
      AUTH_DURATIONS.SESSION_TTL_SECONDS, // 30 days in seconds
    );

    // Track session for this user to support logout-all
    await redis.sadd(REDIS_KEYS.userSessions(user.id), sessionId);
    await redis.expire(
      REDIS_KEYS.userSessions(user.id),
      AUTH_DURATIONS.SESSION_TTL_SECONDS,
    );

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
}
