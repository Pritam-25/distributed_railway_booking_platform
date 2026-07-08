import { env } from "@config";
import { OTPRequestedV1, type OTPRequestedV1Type } from "@irctc/contracts";
import { PROCESSING_STATUS, type ProcessingStatus } from "@irctc/kafka";
import { logger as irctcLogger } from "@irctc/logger";
import { IdempotencyRepository } from "@irctc/redis";
import { getOtpEmailTemplate } from "@templates";
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
   * Returns null instead of throwing on validation failure to ensure malformed
   * payload/validation errors are skipped and logged as poison messages, preventing
   * infinite retries in the consumer queue.
   *
   * @param event - Raw Kafka message value.
   * @returns The parsed and typed event payload, or null if validation fails.
   */
  private validateEvent(event: unknown): OTPRequestedV1Type | null {
    const result = OTPRequestedV1.safeParse(event);

    if (!result.success) {
      this.logger.warn(
        { issues: result.error.issues },
        "OTPRequestedV1 schema validation failed",
      );
      return null;
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

    // Check if the event has expired based on OTP_TTL_SECONDS
    const ageMs = Date.now() - parsed.createdAt.getTime();
    if (ageMs > env.OTP_TTL_SECONDS * 1000) {
      this.logger.warn(
        { eventId: parsed.eventId, ageMs },
        "OTP request event expired. Skipping delivery.",
      );
      return PROCESSING_STATUS.INVALID;
    }

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
      const htmlContent = getOtpEmailTemplate(parsed.otp);

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
