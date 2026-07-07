import type { RegisterRequestDto } from "@dto";
import type { UserRepository } from "@repository";
import { logger } from "@irctc/logger";
import { statusCode } from "@irctc/http";
import { ERROR_CODES } from "@utils/errors";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { OtpService } from "./otp.service.js";
import type { OTPRequestedV1Type } from "@irctc/contracts";
import { generateOtp } from "@utils";
import type { OtpEventPublisher } from "@publishers";
import { ERROR_CODES as COMMON_ERROR_CODES, ApiError } from "@irctc/errors";

/**
 * Service handling authentication-related business logic, including registration flows,
 * OTP requests, and password hashing/verification.
 */
export class AuthService {
  constructor(
    private readonly repo: UserRepository,
    private readonly otpPublisher: OtpEventPublisher,
  ) {}

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
}
