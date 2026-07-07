import { REDIS_KEYS } from "@utils/constants";
import { env, redis } from "@config";
import { logger } from "@irctc/logger";
import { statusCode } from "@irctc/http";
import { ERROR_CODES as COMMON_ERROR_CODES, ApiError } from "@irctc/errors";
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
  private static readonly RATE_LIMIT_MAX = 5;
  private static readonly RATE_LIMIT_WINDOW = 3600; // 1 hour in seconds

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
      await redis.expire(rateKey, this.RATE_LIMIT_WINDOW);
    }

    // 2. If the count exceeds the max allowed, throw an error.
    if (nextCount > this.RATE_LIMIT_MAX) {
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
}
