import {
  StationRepository,
  AdminAuthRepository,
  TrainRepository,
  CoachRepository,
  SeatRepository,
  RouteRepository,
  ScheduleRepository,
} from "@repository";
import {
  PostgresOutboxRepository,
  OutboxPublisherWorker,
  type OutboxRepository,
} from "@irctc/kafka";
import {
  StationService,
  AdminAuthService,
  TrainService,
  CoachService,
  SeatService,
  RouteService,
  ScheduleService,
} from "@services";
import {
  StationController,
  AdminAuthController,
  TrainController,
  CoachController,
  SeatController,
  RouteController,
  ScheduleController,
} from "@controllers";
import { prisma, getProducerSync } from "@config";
import { logger } from "@irctc/logger";

/**
 * Dependency injection container for admin-service.
 * Wires repositories, services, controllers, and event publishers.
 * Singleton pattern ensures shared state across the service.
 *
 * IMPORTANT: Must be instantiated AFTER initKafka() has completed
 * (server.ts guarantees this via dynamic import of app.js).
 */
export class AdminContainer {
  private static instance: AdminContainer;

  public readonly outboxRepository: OutboxRepository;
  private readonly outboxWorker: OutboxPublisherWorker;

  public readonly stationController: StationController;
  public readonly trainController: TrainController;
  public readonly adminAuthController: AdminAuthController;
  public readonly coachController: CoachController;
  public readonly seatController: SeatController;
  public readonly routeController: RouteController;
  public readonly scheduleController: ScheduleController;

  private constructor() {
    // 1. Repositories
    const stationRepository = new StationRepository(prisma);
    const adminAuthRepository = new AdminAuthRepository(prisma);
    const trainRepository = new TrainRepository(prisma);
    const coachRepository = new CoachRepository(prisma);
    const seatRepository = new SeatRepository(prisma);
    const routeRepository = new RouteRepository(prisma);
    const scheduleRepository = new ScheduleRepository(prisma);
    this.outboxRepository = new PostgresOutboxRepository(prisma);
    this.outboxWorker = new OutboxPublisherWorker(
      this.outboxRepository,
      getProducerSync,
      logger,
    );

    // 3. Services
    const adminAuthService = new AdminAuthService(adminAuthRepository);

    const stationService = new StationService(
      prisma,
      stationRepository,
      this.outboxRepository,
    );

    const trainService = new TrainService(
      prisma,
      trainRepository,
      this.outboxRepository,
      scheduleRepository,
    );

    const coachService = new CoachService(
      prisma,
      coachRepository,
      trainRepository,
      seatRepository,
      this.outboxRepository,
    );

    const seatService = new SeatService(
      prisma,
      coachRepository,
      seatRepository,
      this.outboxRepository,
    );

    const routeService = new RouteService(
      prisma,
      routeRepository,
      trainRepository,
      stationRepository,
      this.outboxRepository,
    );

    const scheduleService = new ScheduleService(
      prisma,
      scheduleRepository,
      trainRepository,
      routeRepository,
      this.outboxRepository,
    );

    // 4. Controllers
    this.stationController = new StationController(stationService);
    this.adminAuthController = new AdminAuthController(adminAuthService);
    this.trainController = new TrainController(trainService);
    this.coachController = new CoachController(coachService);
    this.seatController = new SeatController(seatService);
    this.routeController = new RouteController(routeService);
    this.scheduleController = new ScheduleController(scheduleService);

    logger.info({ module: "admin-container" }, "Dependencies wired.");
  }

  /**
   * Starts background outbox publisher worker polling loop.
   */
  start(): void {
    this.outboxWorker.start();
  }

  /**
   * Gracefully stops the outbox publisher worker loop.
   */
  async disconnect(): Promise<void> {
    await this.outboxWorker.stop();
  }

  /**
   * Retrieves the singleton container instance.
   */
  static getInstance(): AdminContainer {
    if (!AdminContainer.instance) {
      AdminContainer.instance = new AdminContainer();
    }

    return AdminContainer.instance;
  }
}
