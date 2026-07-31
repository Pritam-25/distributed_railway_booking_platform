import { REDIS_KEYS } from "@utils/constants";
import { env, redis } from "@config";
import { logger } from "@irctc/logger";
import { statusCode } from "@irctc/http";
import { COMMON_ERROR_CODES, ApiError } from "@irctc/errors";
import { ERROR_CODES } from "@utils/errors";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";

/**
 * Pre-registration session payload stored in Redis between the OTP request
 * and the OTP verification step.
 */
export interface RegistrationSessionData {
  firstName: string;
  lastName: string;
  email: string;
  hashedPassword: string;
}

/**
 * ## OtpService
 *
 * Domain service managing OTP generation, storage, verification, and the
 * temporary pre-registration session attached to a successful OTP request.
 *
 * @remarks
 * ### Responsibilities
 * - Stores hashed OTPs and the email-to-session mapping in Redis.
 * - Enforces per-email rate limiting on OTP requests.
 * - Enforces per-session attempt limits on OTP verification.
 * - Persists the registration payload between send-otp and verify-otp
 *   steps.
 *
 * ### Storage & Persistence
 * - **Redis**: OTP hashes (`otp:<sessionId>`), attempt counters
 *   (`otp:attempts:<sessionId>`), rate limiters (`otp:rate:<email>`),
 *   email-to-session mapping (`otp:session:<email>`), and registration
 *   session payloads (`registration:session:<sessionId>`).
 */
export class OtpService {
  /**
   * Rate limit for OTP requests. (max 5 otp attempt per email per hour)
   */
  private static readonly OTP_RATE_LIMIT_MAX = 5;
  /**
   * Sliding window (seconds) for OTP request rate limiting (1 hour).
   */
  private static readonly OTP_RATE_LIMIT_WINDOW = 3600;
  /**
   * Maximum verification attempts per OTP session before it is locked (5 attempts).
   */
  private static readonly OTP_ATTEMPT_LIMIT = 5;

  /**
   * Returns the session ID of an active OTP request for the given email.
   *
   * @remarks
   * ### Side Effects
   * - **Redis**: Reads `otp:session:<email>`.
   * @param email - User's email address.
   * @returns The existing session ID, or `null` if no active session exists.
   */
  static async findExistingOtpSession(email: string): Promise<string | null> {
    return redis.get(REDIS_KEYS.otpSession(email));
  }

  /**
   * Hashes and stores a new OTP, allocating a fresh session ID and
   * enforcing the per-email rate limit.
   *
   * @remarks
   * ### Responsibilities
   * - Increments the per-email rate counter and enforces the maximum.
   * - Hashes the OTP with bcrypt and persists it under the new session ID.
   * - Records the email-to-session mapping for idempotent resend.
   *
   * ### Side Effects
   * - **Redis**: Writes `otp:rate:<email>`, `otp:<sessionId>`, and
   *   `otp:session:<email>`.
   * @param email - User's email address.
   * @param otp - The raw OTP string to hash and store.
   * @param ttlSeconds - Time-to-live for the OTP entry in seconds.
   * @returns Generated session ID.
   * @throws {ApiError}
   * `RATE_LIMIT_EXCEEDED` — The per-email request rate limit has been hit.
   */
  static async storeOtp(
    email: string,
    otp: string,
    ttlSeconds: number,
  ): Promise<string> {
    const rateKey = REDIS_KEYS.otpRate(email);
    const nextCount = await redis.incr(rateKey);

    // 1. Ensure the rate-limit key always has a TTL, even if a prior
    // crash left it without one.
    const ttl = await redis.ttl(rateKey);
    if (ttl === -1) {
      await redis.expire(rateKey, this.OTP_RATE_LIMIT_WINDOW);
    }

    // 2. Enforce rate limit before allocating a session
    if (nextCount > this.OTP_RATE_LIMIT_MAX) {
      logger.warn(
        { module: "otp", count: nextCount },
        "OTP request rate limit exceeded",
      );
      throw new ApiError(
        statusCode.tooManyRequests,
        COMMON_ERROR_CODES.RATE_LIMIT_EXCEEDED,
        "OTP request rate limit exceeded, please try again later",
      );
    }

    const sessionId = randomUUID();
    const hashedOtp = await bcrypt.hash(otp, 10);

    // 3. Persist the hashed OTP and the email-to-session mapping
    await redis.set(REDIS_KEYS.otp(sessionId), hashedOtp, "EX", ttlSeconds);
    await redis.set(REDIS_KEYS.otpSession(email), sessionId, "EX", ttlSeconds);

    return sessionId;
  }

  /**
   * Stores the pre-registration payload under the OTP session ID.
   *
   * @remarks
   * ### Side Effects
   * - **Redis**: Writes `registration:session:<sessionId>` with TTL
   *   `REGISTRATION_OTP_TTL`.
   * @param sessionId - The OTP session identifier.
   * @param data - Pre-registration payload to persist.
   */
  static async storeRegistrationSession(
    sessionId: string,
    data: RegistrationSessionData,
  ): Promise<void> {
    await redis.set(
      REDIS_KEYS.registrationSession(sessionId),
      JSON.stringify(data),
      "EX",
      env.REGISTRATION_OTP_TTL,
    );
  }

  /**
   * Retrieves the pre-registration payload for an OTP session.
   *
   * @remarks
   * ### Side Effects
   * - **Redis**: Reads `registration:session:<sessionId>`.
   * @param sessionId - The OTP session identifier.
   * @returns The pre-registration payload, or `null` if the session has
   *   expired or was never created.
   */
  static async getRegistrationSession(
    sessionId: string,
  ): Promise<RegistrationSessionData | null> {
    const data = await redis.get(REDIS_KEYS.registrationSession(sessionId));
    if (!data) return null;
    return JSON.parse(data);
  }

  /**
   * Deletes the OTP, pre-registration session, and attempt counter for a
   * session in a single round trip.
   *
   * @remarks
   * ### Side Effects
   * - **Redis**: Deletes `otp:<sessionId>`,
   *   `registration:session:<sessionId>`, and `otp:attempts:<sessionId>`.
   * @param sessionId - The session identifier to clean up.
   */
  static async deleteRegistrationSession(sessionId: string): Promise<void> {
    await redis.del(
      REDIS_KEYS.otp(sessionId),
      REDIS_KEYS.registrationSession(sessionId),
      REDIS_KEYS.otpAttempts(sessionId),
    );
  }

  /**
   * Overwrites the OTP for an existing session with a fresh one, reusing
   * the original session ID.
   *
   * @remarks
   * Used when an active OTP session already exists for the email
   * (e.g. retry after gateway timeout or user pressing "Resend OTP" again).
   * The existing `sessionId` is reused, a new bcrypt hash replaces the old one,
   * and the attempt counter is cleared. Per-email rate limiting is still enforced.
   *
   * ### Side Effects
   * - **Redis**: Overwrites `otp:<sessionId>`, `otp:session:<email>`,
   *   and `otp:rate:<email>`; deletes `otp:attempts:<sessionId>`.
   * @param sessionId - Existing OTP session identifier to reuse.
   * @param email - User's email address used for rate limiting and session mapping.
   * @param otp - The new raw 6-digit OTP string.
   * @param ttlSeconds - Time-to-live for the new OTP entry in seconds.
   * @throws {ApiError}
   * `RATE_LIMIT_EXCEEDED` — The per-email request rate limit has been hit.
   */
  static async replaceOtp(
    sessionId: string,
    email: string,
    otp: string,
    ttlSeconds: number,
  ): Promise<void> {
    // 1. Enforce rate limit (same rules as storeOtp)
    const rateKey = REDIS_KEYS.otpRate(email);
    const nextCount = await redis.incr(rateKey);

    const ttl = await redis.ttl(rateKey);
    if (ttl === -1) {
      await redis.expire(rateKey, this.OTP_RATE_LIMIT_WINDOW);
    }

    if (nextCount > this.OTP_RATE_LIMIT_MAX) {
      logger.warn(
        { module: "otp", count: nextCount },
        "OTP request rate limit exceeded",
      );
      throw new ApiError(
        statusCode.tooManyRequests,
        COMMON_ERROR_CODES.RATE_LIMIT_EXCEEDED,
        "OTP request rate limit exceeded, please try again later",
      );
    }

    // 2. Overwrite the OTP hash with the freshly generated one
    const hashedOtp = await bcrypt.hash(otp, 10);
    await redis.set(REDIS_KEYS.otp(sessionId), hashedOtp, "EX", ttlSeconds);

    // 3. Refresh the email-to-session mapping TTL
    await redis.set(REDIS_KEYS.otpSession(email), sessionId, "EX", ttlSeconds);

    // 4. Clear the previous attempt counter (old OTP's attempts are irrelevant)
    await redis.del(REDIS_KEYS.otpAttempts(sessionId));
  }

  /**
   * Removes the email-to-session mapping after a successful verification or
   * a rollback.
   *
   * @remarks
   * ### Side Effects
   * - **Redis**: Deletes `otp:session:<email>`.
   * @param email - Email whose mapping should be removed.
   */
  static async deleteOtpSession(email: string): Promise<void> {
    await redis.del(REDIS_KEYS.otpSession(email));
  }

  /**
   * Verifies the submitted OTP against the stored bcrypt hash and enforces
   * the per-session attempt limit.
   *
   * @remarks
   * ### Responsibilities
   * - Increments the attempt counter and aligns its TTL with the OTP entry.
   * - Locks the session once {@link OTP_ATTEMPT_LIMIT} is exceeded by
   *   deleting the stored hash.
   * - Clears the attempt counter on a successful verification.
   *
   * ### Side Effects
   * - **Redis**: Reads/writes `otp:attempts:<sessionId>`, reads
   *   `otp:<sessionId>`, deletes it on lock or on success.
   * @param sessionId - The OTP session identifier.
   * @param otp - The raw OTP string submitted by the user.
   * @returns Resolves `true` on successful verification.
   * @throws {ApiError}
   * `OTP_EXPIRED` — Session does not exist or has expired.
   * @throws {ApiError}
   * `OTP_LOCKED` — Maximum verification attempts exceeded; session deleted.
   * @throws {ApiError}
   * `OTP_INVALID` — Submitted OTP does not match the stored hash.
   */
  static async verifyOtp(sessionId: string, otp: string): Promise<boolean> {
    const hashedOtp = await redis.get(REDIS_KEYS.otp(sessionId));

    if (!hashedOtp) {
      logger.warn({ module: "otp" }, "OTP session not found or expired");
      throw new ApiError(statusCode.notFound, ERROR_CODES.OTP_EXPIRED);
    }

    // 1. Track and limit OTP attempts to prevent brute-force
    const attemptKey = REDIS_KEYS.otpAttempts(sessionId);
    const attempts = await redis.incr(attemptKey);

    if (attempts === 1) {
      const remainingTtl = await redis.ttl(REDIS_KEYS.otp(sessionId));
      const expireTtl =
        remainingTtl > 0 ? remainingTtl : env.REGISTRATION_OTP_TTL;
      await redis.expire(attemptKey, expireTtl);
    }

    if (attempts > this.OTP_ATTEMPT_LIMIT) {
      logger.warn(
        { module: "otp", attempts },
        "OTP session locked due to too many attempts",
      );
      await redis.del(REDIS_KEYS.otp(sessionId));
      throw new ApiError(statusCode.tooManyRequests, ERROR_CODES.OTP_LOCKED);
    }

    const isValid = await bcrypt.compare(otp, hashedOtp);

    if (!isValid) {
      logger.warn({ module: "otp", attempt: attempts }, "Invalid OTP provided");
      throw new ApiError(statusCode.badRequest, ERROR_CODES.OTP_INVALID);
    }

    // 2. Clear attempts on success
    await redis.del(attemptKey);

    return true;
  }
}
