import { prisma, getProducerSync, getConsumer } from "@config";
import {
  PostgresOutboxRepository,
  OutboxPublisherWorker,
  KafkaConsumerRunner,
} from "@irctc/kafka";
import { logger } from "@irctc/logger";
import { CONSUMER_GROUPS } from "@irctc/contracts";
import { PaymentRepository } from "@repository";
import {
  PaymentService,
  PaymentRefundService,
  WebhookProcessor,
} from "@services";
import { PaymentGrpcHandler } from "@grpc";
import { PaymentController } from "@controllers";
import { RefundRequestedConsumer } from "../consumers/index.js";

/**
 * Dependency injection container for payment-service acting as the composition root.
 * Constructs internal repositories and services locally and exposes public external adapters
 * (Controllers and gRPC Handlers) alongside outbox worker lifecycle management.
 */
export class PaymentContainer {
  private static instance: PaymentContainer;

  public readonly paymentController: PaymentController;
  public readonly paymentGrpcHandler: PaymentGrpcHandler;

  private readonly outboxWorker: OutboxPublisherWorker;
  private readonly refundRequestedConsumer: RefundRequestedConsumer;

  private constructor() {
    // 1. Local Repositories & Workers
    const outboxRepository = new PostgresOutboxRepository(prisma);
    const paymentRepository = new PaymentRepository(prisma);

    this.outboxWorker = new OutboxPublisherWorker(
      outboxRepository,
      getProducerSync,
      logger,
    );

    // 2. Local Domain Services
    const paymentService = new PaymentService(
      prisma,
      paymentRepository,
      outboxRepository,
    );

    const paymentRefundService = new PaymentRefundService(
      prisma,
      paymentRepository,
      outboxRepository,
    );

    // 3. Webhook Router
    const webhookProcessor = new WebhookProcessor(
      paymentService,
      paymentRefundService,
    );

    // 4. Kafka Consumers
    const refundConsumerInstance = getConsumer(
      CONSUMER_GROUPS.PAYMENT_REFUND_REQUESTED,
    );
    const refundRunner = new KafkaConsumerRunner(
      refundConsumerInstance,
      logger,
    );
    this.refundRequestedConsumer = new RefundRequestedConsumer(
      getProducerSync(),
      refundRunner,
      paymentRefundService,
      logger,
    );

    // 5. Public External Adapters
    this.paymentController = new PaymentController(
      paymentService,
      paymentRefundService,
      webhookProcessor,
    );
    this.paymentGrpcHandler = new PaymentGrpcHandler(paymentService);

    logger.info(
      { module: "payment-container" },
      "Application components & container initialized.",
    );
  }

  /**
   * Starts background outbox worker and consumer loops.
   */
  async start(): Promise<void> {
    this.outboxWorker.start();
    await this.refundRequestedConsumer.start();
  }

  /**
   * Retrieves the singleton container instance.
   *
   * @returns The singleton instance of PaymentContainer.
   */
  static getInstance(): PaymentContainer {
    if (!PaymentContainer.instance) {
      PaymentContainer.instance = new PaymentContainer();
    }

    return PaymentContainer.instance;
  }

  /**
   * Gracefully stops outbox worker and consumer loops.
   */
  async disconnect(): Promise<void> {
    await this.refundRequestedConsumer.stop();
    await this.outboxWorker.stop();
  }
}
