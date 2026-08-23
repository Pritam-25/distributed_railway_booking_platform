import { prisma, getProducerSync } from "@config";
import { PostgresOutboxRepository, OutboxPublisherWorker } from "@irctc/kafka";
import { logger } from "@irctc/logger";
import { PaymentRepository } from "@repository";
import { PaymentService } from "@services";
import { PaymentGrpcHandler } from "@grpc";
import { PaymentController } from "@controllers";

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

  private constructor() {
    // 1. Local Repositories & Workers
    const outboxRepository = new PostgresOutboxRepository(prisma);
    const paymentRepository = new PaymentRepository(prisma);

    this.outboxWorker = new OutboxPublisherWorker(
      outboxRepository,
      getProducerSync,
      logger,
    );

    // 2. Local Services
    const paymentService = new PaymentService(
      prisma,
      paymentRepository,
      outboxRepository,
    );

    // 3. Public External Adapters
    this.paymentController = new PaymentController(paymentService);
    this.paymentGrpcHandler = new PaymentGrpcHandler(paymentService);

    logger.info({ module: "payment-container" }, "Payment dependencies wired.");
  }

  /**
   * Starts background outbox worker polling loop.
   */
  start(): void {
    logger.info({ module: "container" }, "Starting payment outbox worker...");
    this.outboxWorker.start();
    logger.info(
      { module: "container" },
      "Payment outbox worker started successfully.",
    );
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
   * Gracefully stops outbox worker.
   */
  async disconnect(): Promise<void> {
    logger.info(
      { module: "container" },
      "Initiating graceful shutdown of payment outbox worker...",
    );
    await this.outboxWorker.stop();
    logger.info(
      { module: "container" },
      "Payment outbox worker shut down successfully.",
    );
  }
}
