import {
  StationRepository,
  AdminAuthRepository,
  TrainRepository,
  CoachRepository,
  SeatRepository,
  RouteRepository,
  ScheduleRepository,
} from "@repository";
import { PostgresOutboxRepository, type OutboxRepository } from "@irctc/kafka";
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
import { prisma } from "@config";
import { logger } from "@irctc/logger";

/**
 * Dependency injection container for user-service.
 * Wires repositories, services, controllers, and event publishers.
 * Singleton pattern ensures shared state across the service.
 *
 * IMPORTANT: Must be instantiated AFTER initKafka() has completed
 * (server.ts guarantees this via dynamic import of app.js).
 */
export class AdminContainer {
  private static instance: AdminContainer;

  public readonly outboxRepository: OutboxRepository;

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

    // 3. Services
    const stationService = new StationService(stationRepository);
    const adminAuthService = new AdminAuthService(adminAuthRepository);
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
    const routeService = new RouteService(routeRepository);
    const scheduleService = new ScheduleService(scheduleRepository);

    // 4. Controllers
    this.stationController = new StationController(stationService);
    this.adminAuthController = new AdminAuthController(adminAuthService);
    this.trainController = new TrainController(trainService);
    this.coachController = new CoachController(coachService);
    this.seatController = new SeatController(seatService);
    this.routeController = new RouteController(routeService);
    this.scheduleController = new ScheduleController(scheduleService);

    logger.info(
      { module: "admin-container" },
      "AdminContainer dependencies wired synchronously",
    );
  }

  static getInstance(): AdminContainer {
    if (!AdminContainer.instance) {
      AdminContainer.instance = new AdminContainer();
    }

    return AdminContainer.instance;
  }
}
