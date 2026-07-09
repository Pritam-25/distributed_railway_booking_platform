import { kafka, redis, env, getEmailVendor } from "@config";
import { OtpRequestedConsumer, UserLoggedInConsumer } from "@consumers";
import { CONSUMER_GROUPS, KAFKA_TOPICS } from "@irctc/contracts";
import {
  createConsumer,
  KafkaConsumerRunner,
  RetryPolicies,
} from "@irctc/kafka";
import { logger } from "@irctc/logger";
import { IdempotencyRepository } from "@irctc/redis";
import { OtpNotificationService, WelcomeNotificationService } from "@services";
import { EmailProviderFactory, type EmailProvider } from "@email";

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
    // 1. Initialize the configured email provider strategy.
    const email: EmailProvider = EmailProviderFactory.create(getEmailVendor(), {
      apiKey: env.SENDGRID_API_KEY,
      sender: env.SENDGRID_SENDER,
      logger: logger,
    });

    // 2. Initialize the idempotency repositories to guarantee exactly-once processing.
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

    // 3. Initialize notification application services with their respective dependencies.
    const otpService = new OtpNotificationService(
      otpIdempotency,
      email,
      logger,
    );
    const welcomeService = new WelcomeNotificationService(
      loginIdempotency,
      email,
      logger,
    );

    // 4. Configure consumer retry policy.
    const retryPolicy = RetryPolicies.aggressive();

    /**
     * 5. Initialize the Kafka consumers
     * - OTP requested topic
     * - User logged in topic
     */
    const otpKafkaConsumer = createConsumer(
      kafka,
      CONSUMER_GROUPS.NOTIFICATION_OTP,
      retryPolicy,
    );
    const welcomeKafkaConsumer = createConsumer(
      kafka,
      CONSUMER_GROUPS.NOTIFICATION_WELCOME,
      retryPolicy,
    );

    /**
     * 6. Wrap the Kafka consumers in runners.
     */
    const otpRunner = new KafkaConsumerRunner(otpKafkaConsumer, logger);
    const welcomeRunner = new KafkaConsumerRunner(welcomeKafkaConsumer, logger);

    // 7. Instantiate the high-level orchestrating consumers to execute business logic.
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
