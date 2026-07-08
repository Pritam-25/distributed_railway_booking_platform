import { env } from "@config";
import { UserLoggedInV1, type UserLoggedInV1Type } from "@irctc/contracts";
import { PROCESSING_STATUS, type ProcessingStatus } from "@irctc/kafka";
import { logger as irctcLogger } from "@irctc/logger";
import { IdempotencyRepository } from "@irctc/redis";
import { renderWelcomeEmail } from "@templates";
import type { EmailProvider } from "@email";

/**
 * Service managing the processing and delivery of "Welcome back" notifications.
 * Ensures strict event idempotency using Redis to avoid duplicate email dispatches.
 */
export class WelcomeNotificationService {
  /**
   * The localized logger context for Welcome notification operations.
   */
  private readonly logger: typeof irctcLogger;

  /**
   * Creates an instance of WelcomeNotificationService.
   *
   * @param idempotency - Repository utilized to enforce idempotency keys.
   * @param emailProvider - Provider used to dispatch outbound emails.
   * @param logger - Parent logger context.
   */
  constructor(
    private readonly idempotency: IdempotencyRepository,
    private readonly emailProvider: EmailProvider,
    logger: typeof irctcLogger,
  ) {
    this.logger = logger.child({
      module: "welcome-notification-service",
    });
  }

  /**
   * Validates the incoming raw event object against the UserLoggedInV1 Zod schema.
   * Returns null instead of throwing on validation failure to ensure malformed
   * payload/validation errors are skipped and logged as poison messages, preventing
   * infinite retries in the consumer queue.
   *
   * @param event - Raw Kafka message value.
   * @returns The parsed and typed event payload, or null if validation fails.
   */
  private validateEvent(event: unknown): UserLoggedInV1Type | null {
    const result = UserLoggedInV1.safeParse(event);

    if (!result.success) {
      this.logger.warn(
        { issues: result.error.issues },
        "UserLoggedInV1 schema validation failed",
      );
      return null;
    }

    return result.data;
  }

  /**
   * Processes the user logged-in event by checking for duplicate records,
   * sending the welcome email, and updating the idempotency reservation.
   *
   * @param event - The raw event parsed from the Kafka broker.
   * @returns The processing outcome status.
   * @throws {Error} - If message processing or email delivery fails, triggering consumer retry.
   */
  async process(event: unknown): Promise<ProcessingStatus> {
    const parsed = this.validateEvent(event);

    if (!parsed) return PROCESSING_STATUS.INVALID;

    // Check if the welcome event is stale based on WELCOME_TTL_SECONDS
    const ageMs = Date.now() - parsed.loggedInAt.getTime();
    if (ageMs > env.WELCOME_TTL_SECONDS * 1000) {
      this.logger.warn(
        { eventId: parsed.eventId, ageMs },
        "Welcome email event expired. Skipping delivery.",
      );
      return PROCESSING_STATUS.INVALID;
    }

    // Check and reserve eventId to guarantee exactly-once processing
    const reserved = await this.idempotency.reserveIfNew(parsed.eventId);
    if (!reserved) {
      this.logger.info(
        { eventId: parsed.eventId },
        "Duplicate UserLoggedInV1 skipped",
      );
      return PROCESSING_STATUS.DUPLICATE;
    }

    try {
      // Render welcome email parameters (subject, text, and html) using the template generator
      const emailOptions = renderWelcomeEmail({
        email: parsed.email,
        firstName: parsed.firstName,
        lastName: parsed.lastName,
        loggedInAt: parsed.loggedInAt,
      });

      // Trigger outbound email delivery
      await this.emailProvider.send(emailOptions);
    } catch (err) {
      // Release reservation on failure to allow subsequent consumption retries
      await this.idempotency.release(parsed.eventId).catch((releaseErr) => {
        this.logger.warn(
          { eventId: parsed.eventId, error: releaseErr },
          "Failed to release welcome notification idempotency reservation after send failure",
        );
      });
      throw err;
    }

    // Persist finalized success status
    await this.idempotency.markProcessed(parsed.eventId);

    this.logger.info(
      { eventId: parsed.eventId },
      "Welcome email delivered successfully.",
    );
    return PROCESSING_STATUS.PROCESSED;
  }
}
