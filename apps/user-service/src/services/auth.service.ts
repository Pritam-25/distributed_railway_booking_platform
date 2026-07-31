import type {
  AuthResponseDto,
  LoginRequestDto,
  RegisterRequestDto,
  VerifyOtpRequestDto,
  ForgotPasswordRequestDto,
  VerifyPasswordResetOtpRequestDto,
  ResetPasswordRequestDto,
  SessionSummaryDto,
  VerifyPasswordResetOtpResponseDto,
  ForgotPasswordResponseDto,
  SessionRecord,
} from "@dto";
import type { UserRepository } from "@repository";
import { logger } from "@irctc/logger";
import { statusCode } from "@irctc/http";
import { ERROR_CODES } from "@utils/errors";
import { createHash, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env, redis } from "@config";
import { OtpService, type RegistrationSessionData } from "./otp.service.js";
import {
  OtpPurpose,
  type OTPRequestedV1Type,
  type UserLoggedInV1Type,
} from "@irctc/contracts";
import { generateOtp, getIpLocation, verifyRefreshToken } from "@utils";
import type {
  OtpEventPublisher,
  UserLoggedInEventPublisher,
} from "@publishers";
import { COMMON_ERROR_CODES, ApiError } from "@irctc/errors";
import { AUTH_DURATIONS, REDIS_KEYS } from "@utils/constants";
import { UserMapper } from "@mappers";

/**
 * ## AuthService
 *
 * Core domain service managing user authentication, session management,
 * OTP flows, and password recovery.
 *
 * @remarks
 * ### Responsibilities
 * - Orchestrates registration, login, session lifecycle, and password
 *   recovery workflows.
 * - Enforces security policies: bcrypt password hashing, JWT token
 *   rotation, device fingerprint binding, and refresh-token reuse
 *   detection.
 * - Maintains ephemeral state (sessions, OTP attempts, password reset
 *   tokens) in Redis.
 *
 * ### Storage & Persistence
 * - **PostgreSQL**: User profiles and credential hashes via
 *   {@link UserRepository}.
 * - **Redis**: Active sessions (`auth:session:<id>`), per-user session
 *   index (`user:sessions:<id>`), and OTP / password reset state.
 *
 * ### Events Published
 * - `OTPRequestedV1` via {@link OtpEventPublisher}.
 * - `UserLoggedInV1` via {@link UserLoggedInEventPublisher} (best-effort).
 */
export class AuthService {
  /**
   * Creates an instance of AuthService.
   *
   * @param repo - Injected UserRepository instance.
   * @param otpPublisher - Injected OtpEventPublisher instance.
   * @param loginPublisher - Injected UserLoggedInEventPublisher instance.
   */
  constructor(
    private readonly repo: UserRepository,
    private readonly otpPublisher: OtpEventPublisher,
    private readonly loginPublisher: UserLoggedInEventPublisher,
  ) {}

  /**
   * Signs a short-lived JWT access token carrying the user identity, the
   * active session ID, and the user's email.
   *
   * @param userId - Unique user identifier.
   * @param sessionId - Active authentication session ID.
   * @param email - User's email address.
   * @returns Signed JWT access token string.
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
   * Signs a long-lived JWT refresh token carrying the user identity and
   * the active session ID.
   *
   * @param userId - Unique user identifier.
   * @param sessionId - Active authentication session ID.
   * @returns Signed JWT refresh token string.
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
   * Persists a new Redis session record and updates the user's session
   * index atomically.
   *
   * @remarks
   * ### Responsibilities
   * - Hashes the refresh token with SHA-256 before storage.
   * - Builds a session payload including user info, IP, User-Agent, and
   *   geolocation.
   * - Executes an atomic Redis `multi/exec` pipeline to write the session
   *   and update the user index.
   *
   * ### Side Effects
   * - **Redis**: Writes `auth:session:<sessionId>` and updates
   *   `user:sessions:<userId>` with TTL.
   *
   * ### Consistency Guarantees
   * - Executed atomically via Redis pipeline transaction.
   * - Rolls back the session key and the set membership if the pipeline
   *   reports an item-level error.
   * @param userId - User identifier owning the session.
   * @param sessionId - Unique session UUID.
   * @param refreshToken - Raw refresh token string (hashed before storage).
   * @param fingerprint - Device fingerprint string for binding.
   * @param ipAddress - Request IP address.
   * @param userAgent - Client User-Agent header string.
   * @throws {Error} If Redis pipeline execution fails or any item errors.
   */
  private async createAuthSession(
    userId: string,
    sessionId: string,
    refreshToken: string,
    fingerprint: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    // 1. Hash incoming refresh token with SHA-256 for secure storage
    const refreshTokenHash = createHash("sha256")
      .update(refreshToken)
      .digest("hex");

    // 2. Build session payload record
    const sessionData = {
      userId,
      fingerprint,
      refreshTokenHash,
      ipAddress: ipAddress || "Unknown",
      userAgent: userAgent || "Unknown",
      location: getIpLocation(ipAddress),
      createdAt: new Date().toISOString(),
      lastUsedAt: new Date().toISOString(),
      expiresAt: new Date(
        Date.now() + AUTH_DURATIONS.SESSION_TTL_MS,
      ).toISOString(),
    };

    // 3. Execute atomic Redis transaction to store session and update user index
    const results = await redis
      .multi()
      .set(
        REDIS_KEYS.authSession(sessionId),
        JSON.stringify(sessionData),
        "EX",
        AUTH_DURATIONS.SESSION_TTL_SECONDS,
      )
      .sadd(REDIS_KEYS.userSessions(userId), sessionId)
      .expire(
        REDIS_KEYS.userSessions(userId),
        AUTH_DURATIONS.SESSION_TTL_SECONDS,
      )
      .exec();

    if (!results) {
      throw new Error("Failed to persist authentication session");
    }

    // 4. Handle pipeline execution errors with automatic rollback cleanup
    const hasRedisError = results.some(([error]) => error !== null);
    if (hasRedisError) {
      await Promise.allSettled([
        redis.del(REDIS_KEYS.authSession(sessionId)),
        redis.srem(REDIS_KEYS.userSessions(userId), sessionId),
      ]);

      throw new Error("Failed to persist authentication session");
    }
  }

  /**
   * Retrieves a user account by email address or throws.
   *
   * @param email - User email address to look up.
   * @returns Found `User` record.
   * @throws {ApiError}
   * `USER_NOT_FOUND` — No user record exists with the provided email.
   */
  private async requireUser(email: string) {
    const user = await this.repo.findUserByEmail(email);
    if (!user) {
      logger.warn({ module: "auth" }, "User not found");
      throw new ApiError(statusCode.notFound, ERROR_CODES.USER_NOT_FOUND);
    }
    return user;
  }

  /**
   * Initiates the registration workflow by generating and dispatching an
   * OTP to the user's email.
   *
   * @remarks
   * ### Responsibilities
   * - Validates that the email is not already registered.
   * - Reuses the active OTP session for the email when one exists, or
   *   generates a fresh 6-digit OTP and session.
   * - Stores the hashed user password and pre-registration payload in Redis.
   * - Publishes an `OTPRequestedV1` event to Kafka for email dispatch.
   *
   * ### Side Effects
   * - **PostgreSQL**: Queries user existence by email.
   * - **Redis**: Writes registration session and OTP hash with TTL.
   * - **Kafka**: Publishes `OTPRequestedV1` event.
   *
   * ### Consistency Guarantees
   * - If Kafka event publishing fails, newly created Redis OTP state is
   *   rolled back so the user can safely retry.
   * @param data - Registration request DTO containing email, password,
   *   and name fields.
   * @returns Registration session identifier string.
   * @throws {ApiError}
   * `USER_ALREADY_EXISTS` — User email is already registered in PostgreSQL.
   * @throws {ApiError}
   * `KAFKA_PUBLISH_FAILED` — OTP delivery event dispatch to Kafka failed.
   */
  async sendOtp(data: RegisterRequestDto): Promise<string> {
    // 1. Check if user already exists to prevent duplicate registrations
    const existingUser = await this.repo.findUserByEmail(data.email);
    if (existingUser) {
      logger.warn(
        { module: "auth" },
        "OTP request failed: User already exists",
      );
      throw new ApiError(statusCode.conflict, ERROR_CODES.USER_ALREADY_EXISTS);
    }

    // 2. Check for an existing active OTP session for this email
    const existingSessionId = await OtpService.findExistingOtpSession(
      data.email,
    );
    const otp = generateOtp();
    const hashedPassword = await bcrypt.hash(data.password, 10);
    let sessionId: string;

    if (existingSessionId) {
      // Reuse existing session: generate new OTP, overwrite hash
      sessionId = existingSessionId;
      await OtpService.replaceOtp(
        sessionId,
        data.email,
        otp,
        env.REGISTRATION_OTP_TTL,
      );

      // Update registration data in case user corrected a field
      await OtpService.storeRegistrationSession(sessionId, {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        hashedPassword,
      });

      logger.info(
        { module: "auth", sessionId },
        "Reusing existing OTP session with new OTP",
      );
    } else {
      // New session: generate everything fresh
      sessionId = await OtpService.storeOtp(
        data.email,
        otp,
        env.REGISTRATION_OTP_TTL,
      );

      await OtpService.storeRegistrationSession(sessionId, {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        hashedPassword,
      });
    }

    // 3. Publish OTPRequestedV1 event to Kafka for email dispatch
    const event: OTPRequestedV1Type = {
      eventId: randomUUID(),
      email: data.email,
      otp,
      createdAt: new Date(),
      purpose: OtpPurpose.REGISTRATION,
      ttlSeconds: env.REGISTRATION_OTP_TTL,
    };

    try {
      await this.otpPublisher.publishOtpRequested(event);
    } catch (err) {
      logger.error(
        { module: "auth", err, eventId: event.eventId, purpose: event.purpose },
        "OTP publish failed; rolling back Redis state",
      );
      // Roll back fully if this was a newly created session
      if (!existingSessionId) {
        await OtpService.deleteRegistrationSession(sessionId);
        await OtpService.deleteOtpSession(data.email);
      }
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
   * Persists a new user record in PostgreSQL and establishes an active
   * Redis auth session for that user.
   *
   * @remarks
   * ### Responsibilities
   * - Creates the user entity in PostgreSQL with `emailVerified: true`.
   * - Issues the JWT access and refresh token pair.
   * - Persists the Redis authentication session.
   *
   * ### Side Effects
   * - **PostgreSQL**: Inserts a row into the `User` table.
   * - **Redis**: Stores the active authentication session.
   *
   * ### Consistency Guarantees
   * - If Redis session creation fails after the PostgreSQL user record is
   *   created, the new user record is automatically deleted (rolled back)
   *   to prevent orphaned user accounts.
   * @param data - Pre-registration session data retrieved from Redis.
   * @param sessionId - Active registration session UUID.
   * @param fingerprint - Device fingerprint string.
   * @param ipAddress - User IP address.
   * @param userAgent - User browser User-Agent.
   * @returns Issued authentication tokens and created user profile.
   */
  private async registerUser(
    data: RegistrationSessionData,
    sessionId: string,
    fingerprint: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<AuthResponseDto> {
    // 1. Create new user account in PostgreSQL database
    const user = await this.repo.createUser({
      firstName: data.firstName,
      lastName: data.lastName,
      email: data.email,
      password: data.hashedPassword,
      emailVerified: true,
    });

    // 2. Generate signed JWT access and refresh token pair
    const accessToken = this.generateAccessToken(
      user.id,
      sessionId,
      user.email,
    );
    const refreshToken = this.generateRefreshToken(user.id, sessionId);

    // 3. Persist active auth session in Redis with automatic user rollback on failure
    try {
      await this.createAuthSession(
        user.id,
        sessionId,
        refreshToken,
        fingerprint,
        ipAddress,
        userAgent,
      );
    } catch (err) {
      logger.error(
        { module: "auth", userId: user.id, err },
        "Session creation failed after user creation; rolling back user record",
      );
      await this.repo.deleteUser(user.id).catch(() => {});
      throw err;
    }

    logger.info(
      { module: "auth", userId: user.id },
      "User registered successfully and session created",
    );

    // 4. Return formatted authentication response payload
    return UserMapper.toAuthResponseDto(user, accessToken, refreshToken);
  }

  /**
   * Completes user registration after successful OTP verification.
   *
   * @remarks
   * ### Responsibilities
   * - Validates the OTP code against the stored session in Redis.
   * - Retrieves the stored pre-registration payload.
   * - Calls {@link registerUser} to persist the user in PostgreSQL and
   *   establish the active session.
   * - Cleans up the temporary registration session from Redis.
   *
   * ### Side Effects
   * - **PostgreSQL**: Creates the user account.
   * - **Redis**: Deletes the registration OTP session; creates the active
   *   auth session.
   *
   * ### Failure Guarantees
   * - Session cleanup failures are caught and logged non-fatally, ensuring
   *   the successful registration response is delivered to the user.
   * @param sessionId - Registration session UUID from cookie.
   * @param data - OTP verification payload containing the 6-digit code.
   * @param fingerprint - Device fingerprint string.
   * @param ipAddress - Request IP address.
   * @param userAgent - Client User-Agent string.
   * @returns Issued authentication tokens and user profile DTO.
   * @throws {ApiError}
   * `REGISTRATION_SESSION_EXPIRED` — Registration session in Redis is
   * missing or expired.
   */
  async verifyAndRegister(
    sessionId: string,
    data: VerifyOtpRequestDto,
    fingerprint: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<AuthResponseDto> {
    // 1. Verify OTP code against Redis session
    await OtpService.verifyOtp(sessionId, data.otp);

    // 2. Retrieve pre-registration session payload from Redis
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

    // 3. Execute user creation and session setup
    const authResponse = await this.registerUser(
      regData,
      sessionId,
      fingerprint,
      ipAddress,
      userAgent,
    );

    // 4. Clean up temporary registration session keys from Redis (best-effort)
    try {
      await OtpService.deleteRegistrationSession(sessionId);
      await OtpService.deleteOtpSession(regData.email);
    } catch (error) {
      logger.warn({ module: "auth", error }, "Session cleanup failed");
    }

    return authResponse;
  }

  /**
   * Authenticates a user with email and password credentials.
   *
   * @remarks
   * ### Responsibilities
   * - Validates the user email and bcrypt password hash.
   * - Generates the access and refresh JWT token pair.
   * - Establishes the active device session in Redis.
   * - Dispatches a `UserLoggedInV1` notification event.
   *
   * ### Side Effects
   * - **PostgreSQL**: Queries the user record by email.
   * - **Redis**: Stores active session metadata and the token hash.
   * - **Kafka**: Publishes `UserLoggedInV1` event.
   *
   * ### Consistency Guarantees
   * - Session persistence in Redis completes before the tokens are returned
   *   to the caller.
   *
   * ### Failure Guarantees
   * - Kafka login event publication is non-blocking; authentication succeeds
   *   even if the notification event delivery fails.
   * @param data - Validated login request payload containing email and password.
   * @param fingerprint - Device fingerprint string for session binding.
   * @param ipAddress - Request IP address.
   * @param userAgent - Client User-Agent string.
   * @returns Auth response object containing generated JWT tokens and user
   *   profile DTO.
   * @throws {ApiError}
   * `USER_NOT_FOUND` — User email is not registered in PostgreSQL.
   * @throws {ApiError}
   * `INVALID_CREDENTIALS` — Password does not match stored bcrypt hash.
   */
  async login(
    data: LoginRequestDto,
    fingerprint: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<AuthResponseDto> {
    // 1. Find user by email address
    logger.debug({ module: "auth" }, "Finding user by email for login...");
    const user = await this.requireUser(data.email);

    // 2. Verify plaintext password against stored bcrypt hash
    logger.debug(
      { module: "auth", userId: user.id },
      "Verifying user password...",
    );
    const isPasswordValid = await bcrypt.compare(data.password, user.password);

    if (!isPasswordValid) {
      logger.warn({ module: "auth" }, "Login failed: Invalid password");
      throw new ApiError(
        statusCode.unauthorized,
        ERROR_CODES.INVALID_CREDENTIALS,
        "Invalid email or password.",
      );
    }

    // 3. Generate session UUID and JWT access/refresh token pair
    logger.debug(
      { module: "auth", userId: user.id },
      "Generating session and tokens...",
    );
    const sessionId = randomUUID();
    const accessToken = this.generateAccessToken(
      user.id,
      sessionId,
      user.email,
    );
    const refreshToken = this.generateRefreshToken(user.id, sessionId);

    // 4. Store active authentication session in Redis
    logger.debug(
      { module: "auth", userId: user.id },
      "Creating auth session in Redis...",
    );
    await this.createAuthSession(
      user.id,
      sessionId,
      refreshToken,
      fingerprint,
      ipAddress,
      userAgent,
    );

    logger.info(
      { module: "auth", userId: user.id },
      "User logged in successfully",
    );

    // 5. Publish UserLoggedInV1 notification event to Kafka (non-blocking best-effort)
    const loginEvent: UserLoggedInV1Type = {
      eventId: randomUUID(),
      userId: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      loggedInAt: new Date(),
    };

    try {
      logger.debug(
        { module: "auth", userId: user.id },
        "Publishing UserLoggedInV1 event...",
      );
      await this.loginPublisher.publishUserLoggedIn(loginEvent);
    } catch (err) {
      logger.error(
        { module: "auth", err, userId: user.id },
        "Welcome email publish failed; continuing without rollback",
      );
    }

    // 6. Return authentication response payload with tokens
    return UserMapper.toAuthResponseDto(user, accessToken, refreshToken);
  }

  /**
   * Rotates tokens and issues a new access/refresh pair (RTR).
   *
   * @remarks
   * ### Responsibilities
   * - Decodes and verifies the incoming refresh JWT.
   * - Validates the active Redis session existence and device fingerprint
   *   binding.
   * - Detects refresh token reuse attempts via SHA-256 token hash
   *   comparisons.
   * - Rotates the refresh token in Redis and updates the session
   *   `lastUsedAt` timestamp.
   *
   * ### Side Effects
   * - **Redis**: Updates the session record with the new refresh token
   *   hash and extended TTL.
   *
   * ### Consistency Guarantees
   * - If refresh token reuse is detected, all active sessions belonging to
   *   the user are immediately revoked as a defensive security measure.
   * @param refreshToken - Existing JWT refresh token string.
   * @param fingerprint - Current client device fingerprint for the binding
   *   check.
   * @returns Newly issued access and refresh tokens with user profile DTO.
   * @throws {ApiError}
   * `INVALID_REFRESH_TOKEN` — Token is invalid, malformed, or has been
   * reused.
   * @throws {ApiError}
   * `SESSION_EXPIRED_OR_REVOKED` — Active session was not found in Redis.
   * @throws {ApiError}
   * `DEVICE_FINGERPRINT_MISMATCH` — Request device fingerprint does not
   * match session fingerprint.
   */
  async refresh(
    refreshToken: string,
    fingerprint: string,
  ): Promise<AuthResponseDto> {
    try {
      // 1. Decode and verify JWT refresh token signature
      const decoded = verifyRefreshToken(refreshToken);

      if (!decoded) {
        throw new ApiError(
          statusCode.unauthorized,
          ERROR_CODES.INVALID_REFRESH_TOKEN,
        );
      }
      const { sub: userId, sessionId } = decoded;

      // 2. Load active session record from Redis
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

      // 3. Verify device fingerprint binding
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

      // 4. Compare SHA-256 hash of incoming refresh token (Reuse Detection)
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
          ERROR_CODES.INVALID_REFRESH_TOKEN,
        );
      }

      // 5. Generate NEW rotated access and refresh token pair
      const user = await this.requireUser(session.userId);

      const accessToken = this.generateAccessToken(
        user.id,
        sessionId,
        user.email,
      );
      const newRefreshToken = this.generateRefreshToken(user.id, sessionId);
      const newRefreshTokenHash = createHash("sha256")
        .update(newRefreshToken)
        .digest("hex");

      // 6. Update session record in Redis with rotated refresh token hash
      session.refreshTokenHash = newRefreshTokenHash;
      session.lastUsedAt = new Date().toISOString();

      await redis.set(
        sessionKey,
        JSON.stringify(session),
        "EX",
        AUTH_DURATIONS.SESSION_TTL_SECONDS,
      );

      await redis.expire(
        REDIS_KEYS.userSessions(userId),
        AUTH_DURATIONS.SESSION_TTL_SECONDS,
      );

      logger.info({ module: "auth", userId }, "Token refreshed successfully");
      return UserMapper.toAuthResponseDto(user, accessToken, newRefreshToken);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(
        statusCode.unauthorized,
        ERROR_CODES.INVALID_REFRESH_TOKEN,
      );
    }
  }

  /**
   * Retrieves all active device sessions for a specific user.
   *
   * @remarks
   * ### Responsibilities
   * - Fetches the session keys associated with the user from Redis.
   * - Filters out expired or stale sessions and cleans up the set index.
   * - Strips sensitive fields (e.g. `refreshTokenHash`) from the returned
   *   objects.
   *
   * ### Side Effects
   * - **Redis**: Reads the per-user session set and individual session
   *   keys; removes stale session IDs from the set index.
   * @param userId - User identifier.
   * @returns Array of active session summary DTOs.
   */
  async getSessions(userId: string): Promise<SessionSummaryDto[]> {
    // 1. Retrieve session IDs belonging to the user from Redis set
    const sessionsKey = REDIS_KEYS.userSessions(userId);
    const sessionIds = await redis.smembers(sessionsKey);

    // 2. Fetch session data objects and sanitize sensitive token hashes
    const sessions = await Promise.all(
      sessionIds.map(async (id): Promise<SessionSummaryDto | null> => {
        const authSessionKey = REDIS_KEYS.authSession(id);
        const data = await redis.get(authSessionKey);
        if (!data) {
          // Clean up stale session ID from Redis set index
          redis.srem(sessionsKey, id).catch((err) => {
            logger.error(
              { module: "auth", userId, sessionId: id },
              "Failed to remove stale session ID",
              err,
            );
          });
          return null;
        }
        const session = JSON.parse(data) as SessionRecord;
        delete (session as Partial<SessionRecord>).refreshTokenHash;

        return {
          sessionId: id,
          ...session,
        };
      }),
    );

    // 3. Filter out null values from stale sessions and return
    return sessions.filter(
      (session): session is SessionSummaryDto => session !== null,
    );
  }

  /**
   * Revokes a specific session by session ID after verifying ownership.
   *
   * @remarks
   * ### Responsibilities
   * - Verifies that the requesting user owns the session before deletion.
   * - Deletes the session payload and updates the user session set index
   *   in Redis.
   *
   * ### Side Effects
   * - **Redis**: Deletes `auth:session:<sessionId>` and removes the ID
   *   from `user:sessions:<userId>`.
   * @param sessionId - Session identifier UUID to revoke.
   * @param userId - Requesting authenticated user ID.
   * @throws {ApiError}
   * `SESSION_OWNERSHIP_INVALID` — Target session does not belong to the
   * requesting user.
   */
  async revokeSession(sessionId: string, userId: string): Promise<void> {
    // 1. Fetch session record from Redis
    const sessionKey = REDIS_KEYS.authSession(sessionId);
    const sessionJson = await redis.get(sessionKey);

    if (!sessionJson) return;

    // 2. Validate session ownership to prevent cross-user session revocation
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

    // 3. Delete session key and remove from user session index in Redis
    await redis.del(sessionKey);
    await redis.srem(REDIS_KEYS.userSessions(userId), sessionId);
    logger.info({ module: "auth", userId }, "Session revoked");
  }

  /**
   * Logs out the current device by deleting its active session.
   *
   * @remarks
   * ### Side Effects
   * - **Redis**: Removes `auth:session:<sessionId>` and the session ID from
   *   `user:sessions:<userId>`.
   * @param sessionId - Session UUID to delete.
   * @param userId - User ID owning the session.
   */
  private async logout(sessionId: string, userId: string): Promise<void> {
    logger.info({ module: "auth", userId }, "Logging out current device");

    // 1. Delete session record and remove from user set index in Redis
    await redis.del(REDIS_KEYS.authSession(sessionId));
    await redis.srem(REDIS_KEYS.userSessions(userId), sessionId);

    logger.info({ module: "auth", userId }, "Session deleted successfully");
  }

  /**
   * Revokes all active device sessions for a user.
   *
   * @remarks
   * ### Responsibilities
   * - Retrieves all session IDs owned by the user and deletes them in
   *   batch.
   * - Deletes the user session index set in Redis.
   *
   * ### Side Effects
   * - **Redis**: Deletes all `auth:session:<sessionId>` keys and the
   *   `user:sessions:<userId>` set.
   * @param userId - User identifier whose sessions are being revoked.
   */
  private async logoutAll(userId: string): Promise<void> {
    logger.info({ module: "auth", userId }, "Logging out all devices");

    // 1. Fetch all session IDs associated with the user
    const sessionsKey = REDIS_KEYS.userSessions(userId);
    const sessions = await redis.smembers(sessionsKey);

    // 2. Batch delete all session payload keys from Redis
    if (sessions.length > 0) {
      const sessionKeys = sessions.map((id) => REDIS_KEYS.authSession(id));
      await redis.del(...sessionKeys);
    }

    // 3. Delete user session index set from Redis
    await redis.del(sessionsKey);

    logger.info(
      { module: "auth", userId, sessionCount: sessions.length },
      "All user sessions deleted",
    );
  }

  /**
   * Gracefully revokes the active session associated with a refresh token
   * cookie. Best-effort execution: invalid or expired refresh tokens fail
   * silently. Use {@link logout} to log out a specific device.
   *
   * @param refreshToken - Raw JWT refresh token string.
   */
  async logoutByRefreshToken(refreshToken?: string): Promise<void> {
    if (!refreshToken) return;
    const decoded = verifyRefreshToken(refreshToken);
    if (!decoded?.sub || !decoded.sessionId) return;

    try {
      await this.logout(decoded.sessionId, decoded.sub);
    } catch (err) {
      logger.error(
        {
          module: "auth",
          err,
          userId: decoded.sub,
          sessionId: decoded.sessionId,
        },
        "Session revocation failed during logoutByRefreshToken",
      );
    }
  }

  /**
   * Gracefully revokes all active sessions for the user associated with a
   * refresh token cookie. Best-effort execution: invalid or expired
   * refresh tokens fail silently. Use {@link logoutAll} to revoke all
   * sessions for a specific user.
   *
   * @param refreshToken - Raw JWT refresh token string.
   */
  async logoutAllByRefreshToken(refreshToken?: string): Promise<void> {
    if (!refreshToken) return;
    const decoded = verifyRefreshToken(refreshToken);
    if (!decoded?.sub) return;

    try {
      await this.logoutAll(decoded.sub);
    } catch (err) {
      logger.error(
        { module: "auth", err, userId: decoded.sub },
        "Session revocation failed during logoutAllByRefreshToken",
      );
    }
  }

  /**
   * Initiates the password recovery workflow by dispatching a reset OTP.
   *
   * @remarks
   * ### Responsibilities
   * - Validates user existence in PostgreSQL.
   * - Generates or reuses a 6-digit password reset OTP in Redis.
   * - Dispatches an `OTPRequestedV1` event to Kafka for email delivery.
   *
   * ### Side Effects
   * - **PostgreSQL**: Queries user by email.
   * - **Redis**: Stores OTP and forgot-password session keys with TTL.
   * - **Kafka**: Publishes `OTPRequestedV1` event.
   *
   * ### Consistency Guarantees
   * - If Kafka event publication fails, newly generated forgot-password
   *   Redis keys are rolled back.
   * @param data - Forgot password request DTO containing email.
   * @returns Forgot password response payload containing the reset
   *   `sessionId`.
   * @throws {ApiError}
   * `USER_NOT_FOUND` — Email is not registered in PostgreSQL.
   * @throws {ApiError}
   * `KAFKA_PUBLISH_FAILED` — OTP delivery event dispatch to Kafka failed.
   */
  async forgotPassword(
    data: ForgotPasswordRequestDto,
  ): Promise<ForgotPasswordResponseDto> {
    // 1. Ensure the email is associated with an existing user in PostgreSQL
    await this.requireUser(data.email);

    // 2. Check for an existing active OTP session for this email
    const existingSessionId = await OtpService.findExistingOtpSession(
      data.email,
    );
    const otp = generateOtp();
    let sessionId: string;

    if (existingSessionId) {
      // Reuse existing session: generate new OTP, overwrite hash
      sessionId = existingSessionId;
      await OtpService.replaceOtp(
        sessionId,
        data.email,
        otp,
        env.FORGOT_PASSWORD_OTP_TTL,
      );

      // Refresh the forgot password session TTL
      await redis.set(
        REDIS_KEYS.forgotPasswordSession(sessionId),
        data.email,
        "EX",
        env.FORGOT_PASSWORD_OTP_TTL,
      );

      logger.info(
        { module: "auth", sessionId },
        "Reusing existing OTP session for forgot password with new OTP",
      );
    } else {
      // New session setup
      sessionId = await OtpService.storeOtp(
        data.email,
        otp,
        env.FORGOT_PASSWORD_OTP_TTL,
      );

      await redis.set(
        REDIS_KEYS.forgotPasswordSession(sessionId),
        data.email,
        "EX",
        env.FORGOT_PASSWORD_OTP_TTL,
      );
    }

    // 3. Publish OTPRequestedV1 event to Kafka for email dispatch
    const event: OTPRequestedV1Type = {
      eventId: randomUUID(),
      email: data.email,
      otp,
      createdAt: new Date(),
      purpose: OtpPurpose.FORGOT_PASSWORD,
      ttlSeconds: env.FORGOT_PASSWORD_OTP_TTL,
    };

    try {
      await this.otpPublisher.publishOtpRequested(event);
    } catch (err) {
      logger.error(
        { module: "auth", err, eventId: event.eventId },
        "Forgot password OTP publish failed; rolling back Redis state",
      );
      // Roll back fully if this was a new session
      if (!existingSessionId) {
        await redis.del(
          REDIS_KEYS.otp(sessionId),
          REDIS_KEYS.forgotPasswordSession(sessionId),
        );
        await OtpService.deleteOtpSession(data.email);
      }
      throw new ApiError(
        statusCode.badGateway,
        COMMON_ERROR_CODES.KAFKA_PUBLISH_FAILED,
        `Kafka Published Failed for Forgot Password OTP Delivery`,
        { cause: err },
      );
    }

    return { sessionId };
  }

  /**
   * Verifies the password reset OTP and issues a single-use password
   * reset token.
   *
   * @remarks
   * ### Responsibilities
   * - Validates the session and OTP code using {@link OtpService}.
   * - Generates a short-lived password reset token in Redis with a
   *   `PASSWORD_RESET_TOKEN_TTL_SECONDS` TTL.
   * - Consumes and deletes the verification OTP session data from Redis.
   *
   * ### Side Effects
   * - **Redis**: Stores `password:reset:token:<token>`; deletes the OTP
   *   session keys.
   * @param data - DTO containing `sessionId` and the submitted OTP code.
   * @returns Object containing the issued `passwordResetToken`.
   * @throws {ApiError}
   * `OTP_SESSION_NOT_FOUND` — Forgot-password session in Redis is missing
   * or expired.
   * @throws {ApiError}
   * `INVALID_OTP` — Submitted OTP code is incorrect or expired.
   */
  async VerifyPasswordResetOtp(
    data: VerifyPasswordResetOtpRequestDto,
  ): Promise<VerifyPasswordResetOtpResponseDto> {
    // 1. Retrieve email linked to the forgot password session from Redis
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

    // 2. Verify OTP code (throws if invalid or locked due to excess attempts)
    await OtpService.verifyOtp(data.sessionId, data.otp);

    // 3. Generate short-lived single-use password reset token in Redis
    const token = randomUUID();
    await redis.set(
      REDIS_KEYS.passwordResetToken(token),
      email,
      "EX",
      AUTH_DURATIONS.PASSWORD_RESET_TOKEN_TTL_SECONDS,
    );

    // 4. Clean up OTP session data from Redis
    await redis.del(
      REDIS_KEYS.otp(data.sessionId),
      REDIS_KEYS.forgotPasswordSession(data.sessionId),
      REDIS_KEYS.otpAttempts(data.sessionId),
    );
    await OtpService.deleteOtpSession(email);

    logger.info(
      { module: "auth", sessionId: data.sessionId },
      "OTP verified, reset token issued",
    );
    return { passwordResetToken: token };
  }

  /**
   * Resets the user password and revokes all active device sessions.
   *
   * @remarks
   * ### Responsibilities
   * - Validates the password reset token from Redis.
   * - Hashes the new password with bcrypt and updates the user record in
   *   PostgreSQL.
   * - Revokes all existing active device sessions for security.
   * - Deletes the consumed password reset token from Redis.
   *
   * ### Side Effects
   * - **PostgreSQL**: Updates the user `password` hash.
   * - **Redis**: Revokes all user sessions; deletes the password reset
   *   token.
   * @param data - DTO containing the `passwordResetToken` and new password.
   * @throws {ApiError}
   * `OTP_SESSION_NOT_FOUND` — Reset token is invalid, missing, or expired
   * in Redis.
   * @throws {ApiError}
   * `USER_NOT_FOUND` — User email linked to the token does not exist in
   * PostgreSQL.
   */
  async resetPassword(data: ResetPasswordRequestDto): Promise<void> {
    // 1. Retrieve email linked to the password reset token from Redis
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

    // 2. Fetch user record from PostgreSQL
    const user = await this.requireUser(email);

    // 3. Hash new password and update database record
    const hashedPassword = await bcrypt.hash(data.password, 10);
    await this.repo.update(user.id, { password: hashedPassword });

    // 4. Revoke all existing active device sessions for security
    await this.logoutAll(user.id);

    // 5. Clean up consumed password reset token from Redis
    await redis.del(REDIS_KEYS.passwordResetToken(data.passwordResetToken));

    logger.info(
      { module: "auth", userId: user.id },
      "Password reset successfully and active sessions revoked",
    );
  }
}
