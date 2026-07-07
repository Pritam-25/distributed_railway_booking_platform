import { REDIS_KEYS } from "@utils/constants";
import { env, redis } from "@config";
import { logger } from "@irctc/logger";
import { statusCode } from "@irctc/http";
import { ERROR_CODES as COMMON_ERROR_CODES, ApiError } from "@irctc/errors";
import { ERROR_CODES as AUTH_ERROR_CODES } from "@utils/errors";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";

/**
 * Pre-registration session data containing registration details.
 */
interface RegistrationSessionData {
  firstName: string;
  lastName: string;
  email: string;
  hashedPassword: string;
}

/**
 * Service managing OTP (One-Time Password) generation, lifecycle, validation,
 * rate limiting, and temporary pre-registration session storage in Redis.
 */
export class OtpService {
  private static readonly OTP_RATE_LIMIT_MAX = 5;
  private static readonly OTP_RATE_LIMIT_WINDOW = 3600; // 1 hour in seconds
  private static readonly OTP_ATTEMPT_LIMIT = 3;

  /**
   * Stores a hashed OTP in Redis and handles rate limiting.
   *
   * @param email - User's email address.
   * @param otp - The raw OTP string.
   * @returns A promise that resolves to the generated session ID.
   * @throws {ApiError} - If the OTP request rate limit is exceeded.
   */
  static async storeOtp(email: string, otp: string): Promise<string> {
    const rateKey = REDIS_KEYS.otpRate(email);
    const nextCount = await redis.incr(rateKey);

    // 1. If this is the first OTP request, set an expiration for the rate limit key.
    if (nextCount === 1) {
      await redis.expire(rateKey, this.OTP_RATE_LIMIT_WINDOW);
    }

    // 2. If the count exceeds the max allowed, throw an error.
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

    // EX means expire, and env.OTP_TTL is the time-to-live for the OTP in seconds.
    await redis.set(REDIS_KEYS.otp(sessionId), hashedOtp, "EX", env.OTP_TTL);

    return sessionId;
  }

  /**
   * Stores registration data in Redis tied to the session ID.
   *
   * @param sessionId - The session identifier.
   * @param data - The pre-registration data to store.
   */
  static async storeRegistrationSession(
    sessionId: string,
    data: RegistrationSessionData,
  ): Promise<void> {
    await redis.set(
      REDIS_KEYS.registrationSession(sessionId),
      JSON.stringify(data),
      "EX",
      env.OTP_TTL,
    );
  }

  /**
   * Retrieves registration data from Redis.
   *
   * @param sessionId - The session identifier.
   * @returns A promise that resolves to the registration session data, or null if expired/not found.
   */
  static async getRegistrationSession(
    sessionId: string,
  ): Promise<RegistrationSessionData | null> {
    const data = await redis.get(REDIS_KEYS.registrationSession(sessionId));
    if (!data) return null;
    return JSON.parse(data);
  }

  /**
   * Cleans up both OTP and registration sessions from Redis.
   *
   * @param sessionId - The session identifier to clean up.
   */
  static async deleteRegistrationSession(sessionId: string): Promise<void> {
    await redis.del(
      REDIS_KEYS.otp(sessionId),
      REDIS_KEYS.registrationSession(sessionId),
    );
  }

  /**
   * Verifies the provided OTP against the stored hashed OTP in Redis.
   * Tracks and limits attempts to prevent brute-forcing. If maximum attempts
   * are exceeded, the OTP is deleted/invalidated.
   *
   * @param sessionId - The OTP session identifier.
   * @param otp - The raw OTP string to verify.
   * @returns A promise that resolves to true if verification succeeds.
   * @throws {ApiError}
   * - OTP_EXPIRED if session does not exist or has expired.
   * - OTP_LOCKED if maximum attempts are exceeded (session becomes locked).
   * - OTP_INVALID if the provided OTP does not match.
   */
  static async verifyOtp(sessionId: string, otp: string): Promise<boolean> {
    const hashedOtp = await redis.get(REDIS_KEYS.otp(sessionId));

    if (!hashedOtp) {
      logger.warn({ module: "otp" }, "OTP session not found or expired");
      throw new ApiError(statusCode.notFound, AUTH_ERROR_CODES.OTP_EXPIRED);
    }

    // 1. Track and limit OTP attempts to prevent brute-force
    const attemptKey = REDIS_KEYS.otpAttempts(sessionId);
    const attempts = await redis.incr(attemptKey);

    if (attempts === 1) {
      await redis.expire(attemptKey, env.OTP_TTL);
    }

    if (attempts > this.OTP_ATTEMPT_LIMIT) {
      logger.warn(
        { module: "otp", attempts },
        "OTP session locked due to too many attempts",
      );
      // Delete OTP session to block further attempts
      await redis.del(REDIS_KEYS.otp(sessionId));
      throw new ApiError(
        statusCode.tooManyRequests,
        AUTH_ERROR_CODES.OTP_LOCKED,
      );
    }

    const isValid = await bcrypt.compare(otp, hashedOtp);

    if (!isValid) {
      logger.warn({ module: "otp", attempt: attempts }, "Invalid OTP provided");
      throw new ApiError(statusCode.badRequest, AUTH_ERROR_CODES.OTP_INVALID);
    }

    // Clear attempts on success
    await redis.del(attemptKey);

    return true;
  }
}
