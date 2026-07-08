import { OTPRequestedV1, type OTPRequestedV1Type } from "@irctc/contracts";
import { PROCESSING_STATUS, type ProcessingStatus } from "@irctc/kafka";
import { logger as irctcLogger } from "@irctc/logger";
import { IdempotencyRepository } from "@irctc/redis";
import type { EmailService } from "./email.service.js";

/**
 * Service managing the processing and delivery of One-Time Password (OTP) notifications.
 * Ensures strict event idempotency using Redis to avoid duplicate email dispatches.
 */
export class OtpNotificationService {
  /**
   * The localized logger context for OTP notification operations.
   */
  private readonly logger: typeof irctcLogger;

  /**
   * Creates an instance of OtpNotificationService.
   *
   * @param idempotency - Repository utilized to enforce idempotency keys.
   * @param emailService - Service used to dispatch outbound emails.
   * @param logger - Parent logger context.
   */
  constructor(
    private readonly idempotency: IdempotencyRepository,
    private readonly emailService: EmailService,
    logger: typeof irctcLogger,
  ) {
    this.logger = logger.child({
      module: "otp-notification-service",
    });
  }

  /**
   * Validates the incoming raw event object against the OTPRequestedV1 Zod schema.
   *
   * @param event - Raw Kafka message value.
   * @returns The parsed and typed event payload.
   * @throws {Error} - If schema validation fails.
   */
  private validateEvent(event: unknown): OTPRequestedV1Type {
    const result = OTPRequestedV1.safeParse(event);

    if (!result.success) {
      this.logger.warn(
        { issues: result.error.issues },
        "OTPRequestedV1 schema validation failed",
      );
      throw new Error("Invalid OTP requested event", {
        cause: result.error,
      });
    }

    return result.data;
  }

  /**
   * Processes the OTP requested event by checking for duplicate records,
   * sending the OTP email, and updating the idempotency reservation.
   *
   * @param event - The raw event parsed from the Kafka broker.
   * @returns The processing outcome status.
   * @throws {Error} - If message processing or email delivery fails, triggering consumer retry.
   */
  async process(event: unknown): Promise<ProcessingStatus> {
    const parsed = this.validateEvent(event);

    if (!parsed) return PROCESSING_STATUS.INVALID;

    // Check and reserve eventId to guarantee exactly-once processing
    const reserved = await this.idempotency.reserveIfNew(parsed.eventId);
    if (!reserved) {
      this.logger.info(
        { eventId: parsed.eventId },
        "Duplicate OTPRequestedV1 skipped",
      );
      return PROCESSING_STATUS.DUPLICATE;
    }

    try {
      const subject = "Your IRCTC One-Time Password (OTP)";
      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
          <h2 style="color: #0d6efd; text-align: center;">IRCTC Verification Code</h2>
          <p>Hello,</p>
          <p>We received a request to access your IRCTC account. Use the following verification code to proceed:</p>
          <div style="font-size: 24px; font-weight: bold; text-align: center; margin: 30px 0; padding: 15px; background-color: #f8f9fa; border-radius: 4px; letter-spacing: 2px; color: #333;">
            ${parsed.otp}
          </div>
          <p style="color: #6c757d; font-size: 14px;">This code is valid for 5 minutes. If you did not request this OTP, you can safely ignore this email.</p>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="font-size: 12px; color: #999; text-align: center;">Distributed Railway Booking Platform &copy; 2026</p>
        </div>
      `;

      // Trigger outbound email delivery
      await this.emailService.sendEmail(parsed.email, subject, htmlContent);
    } catch (err) {
      // Release reservation on failure to allow subsequent consumption retries
      await this.idempotency.release(parsed.eventId).catch((releaseErr) => {
        this.logger.warn(
          { eventId: parsed.eventId, error: releaseErr },
          "Failed to release OTP notification idempotency reservation after send failure",
        );
      });
      throw err;
    }

    // Persist finalized success status
    await this.idempotency.markProcessed(parsed.eventId);

    this.logger.info(
      { eventId: parsed.eventId },
      "OTP email delivered successfully.",
    );
    return PROCESSING_STATUS.PROCESSED;
  }
}
