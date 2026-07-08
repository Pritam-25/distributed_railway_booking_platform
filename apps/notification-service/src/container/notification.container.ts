import { kafka, redis, env } from "@config";
import { OtpRequestedConsumer, UserLoggedInConsumer } from "@consumers";
import { CONSUMER_GROUPS, KAFKA_TOPICS } from "@irctc/contracts";
import {
  createConsumer,
  KafkaConsumerRunner,
  RetryPolicies,
} from "@irctc/kafka";
import { logger } from "@irctc/logger";
import { IdempotencyRepository } from "@irctc/redis";
import {
  EmailService,
  OtpNotificationService,
  WelcomeNotificationService,
} from "@services";

/**
 * Dependency injection container for notification-service.
 * Wires repositories, services, and event consumers.
 * Singleton pattern ensures shared state across the service lifecycle.
 *
 * IMPORTANT: Must be instantiated AFTER initKafka() / initRedis() has completed
 * (server.ts guarantees this via dynamic import of container).
 */
export class NotificationContainer {
  /**
   * Singleton container instance.
   */
  private static instance: NotificationContainer;

  /**
   * Consumer instance handling OTP requests.
   */
  private readonly otpConsumer: OtpRequestedConsumer;

  /**
   * Consumer instance handling User Welcome notifications.
   */
  private readonly welcomeConsumer: UserLoggedInConsumer;

  /**
   * Creates an instance of NotificationContainer.
   * Initializes all required services, repositories, and registers/starts consumer loops.
   */
  private constructor() {
    const emailService = new EmailService();

    const otpIdempotency = new IdempotencyRepository(
      redis,
      env.IDEMPOTENCY_PROCESSING_LEASE_SECONDS,
      env.IDEMPOTENCY_TTL_SECONDS,
      KAFKA_TOPICS.USER_OTP_REQUESTED,
    );

    const loginIdempotency = new IdempotencyRepository(
      redis,
      env.IDEMPOTENCY_PROCESSING_LEASE_SECONDS,
      env.IDEMPOTENCY_TTL_SECONDS,
      KAFKA_TOPICS.USER_LOGGED_IN,
    );

    const otpService = new OtpNotificationService(
      otpIdempotency,
      emailService,
      logger,
    );
    const welcomeService = new WelcomeNotificationService(
      loginIdempotency,
      emailService,
      logger,
    );

    const retryPolicy = RetryPolicies.aggressive();

    const otpKafkaConsumer = createConsumer(
      kafka,
      CONSUMER_GROUPS.NOTIFICATION_OTP,
      retryPolicy,
    );

    const otpRunner = new KafkaConsumerRunner(otpKafkaConsumer, logger);

    const welcomeKafkaConsumer = createConsumer(
      kafka,
      CONSUMER_GROUPS.NOTIFICATION_WELCOME,
      retryPolicy,
    );

    const welcomeRunner = new KafkaConsumerRunner(welcomeKafkaConsumer, logger);

    this.otpConsumer = new OtpRequestedConsumer(otpRunner, otpService, logger);
    this.welcomeConsumer = new UserLoggedInConsumer(
      welcomeRunner,
      welcomeService,
      logger,
    );
  }

  /**
   * Starts the event consumer subscription loops.
   *
   * @returns A promise that resolves when all consumers have successfully started.
   */
  async start(): Promise<void> {
    logger.info(
      { module: "container" },
      "Starting notification event consumers...",
    );
    await Promise.all([this.otpConsumer.start(), this.welcomeConsumer.start()]);
    logger.info(
      {
        module: "container",
        otpConsumer: CONSUMER_GROUPS.NOTIFICATION_OTP,
        welcomeConsumer: CONSUMER_GROUPS.NOTIFICATION_WELCOME,
      },
      "Notification service event consumer loops started successfully.",
    );
  }

  /**
   * Retrieves or builds the singleton NotificationContainer instance.
   *
   * @returns The active NotificationContainer instance.
   */
  static getInstance(): NotificationContainer {
    if (!NotificationContainer.instance) {
      NotificationContainer.instance = new NotificationContainer();
    }

    return NotificationContainer.instance;
  }

  /**
   * Gracefully shuts down the consumer loops and releases network resources.
   *
   * @returns A promise that resolves when all consumers have stopped.
   */
  async disconnect(): Promise<void> {
    logger.info(
      { module: "container" },
      "Initiating graceful shutdown of event consumers...",
    );
    await Promise.all([this.otpConsumer.stop(), this.welcomeConsumer.stop()]);
    logger.info(
      { module: "container" },
      "All event consumers shut down successfully.",
    );
  }
}
