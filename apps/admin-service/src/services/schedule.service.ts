import { ScheduleStatus, type PrismaClient } from "@generated/prisma/client.js";
import { ApiError, ERROR_CODES as COMMON_ERROR_CODES } from "@irctc/errors";
import { ERROR_CODES } from "@utils/errors";
import { statusCode } from "@irctc/http";
import type {
  ScheduleRepository,
  TrainRepository,
  RouteRepository,
} from "@repository";
import { type OutboxRepository } from "@irctc/kafka";
import type {
  CreateScheduleRequestDto,
  UpdateScheduleStatusRequestDto,
  ListSchedulesQueryDto,
} from "@dto";
import { ScheduleEventMapper } from "@mappers";
import { KAFKA_HEADERS } from "@irctc/kafka";
import { EVENT_TYPES, KAFKA_TOPICS } from "@irctc/contracts";

/**
 * Service class handling train schedules lifecycle, active route validations,
 * and outbox sync event generation.
 */
export class ScheduleService {
  /**
   * Creates an instance of ScheduleService.
   *
   * @param prisma The Prisma Client context for database transaction orchestration.
   * @param scheduleRepository The repository for schedule database records.
   * @param trainRepository The repository for train database records.
   * @param routeRepository The repository for route database records.
   * @param outboxRepository The repository for outbox transactional logs.
   */
  constructor(
    private readonly prisma: PrismaClient,
    private readonly scheduleRepository: ScheduleRepository,
    private readonly trainRepository: TrainRepository,
    private readonly routeRepository: RouteRepository,
    private readonly outboxRepository: OutboxRepository,
  ) {}

  /**
   * Creates a new Schedule in DRAFT or ACTIVE status.
   * Ensures train exists, train has an active route with at least 2 stops, and train isn't already scheduled on that date.
   *
   * @param dto CreateScheduleRequestDto containing train ID and journey date.
   * @throws {ApiError} If train is not found, train has no active route, route has < 2 stops, or train is already scheduled for that day.
   * @returns A promise resolving to the created schedule.
   */
  async createSchedule(dto: CreateScheduleRequestDto) {
    // Standardize date to day-only to check date uniqueness without hours/minutes issues
    const normalizedDate = new Date(dto.departureDate);
    normalizedDate.setUTCHours(0, 0, 0, 0);

    return this.prisma.$transaction(async (tx) => {
      // Validate Train exists
      const train = await this.trainRepository.getTrainById(dto.trainId, tx);
      if (!train) {
        throw new ApiError(statusCode.notFound, ERROR_CODES.TRAIN_NOT_FOUND);
      }

      // Validate Train operating days
      const scheduleDayOfWeek = normalizedDate.getUTCDay();
      if (!train.operatingDays || train.operatingDays.length === 0) {
        throw new ApiError(
          statusCode.conflict,
          ERROR_CODES.TRAIN_NO_OPERATING_DAYS_CONFIGURED,
          "Cannot schedule a train that has no operating days configured.",
        );
      }

      const isOperatingOnDay = train.operatingDays.some(
        (opDay) => opDay.dayOfWeek === scheduleDayOfWeek,
      );
      if (!isOperatingOnDay) {
        throw new ApiError(
          statusCode.conflict,
          ERROR_CODES.TRAIN_NOT_OPERATING_ON_DAY,
          "Train does not operate on the scheduled day of the week.",
        );
      }

      // Validate Train has an active Route
      const route = await this.routeRepository.getRouteByTrainId(
        dto.trainId,
        false,
        tx,
      );
      if (!route) {
        throw new ApiError(
          statusCode.conflict,
          ERROR_CODES.ROUTE_NOT_FOUND,
          "Cannot schedule a train that does not have an active route.",
        );
      }

      // Validate Route has at least 2 stops
      if (route.routeStation.length < 2) {
        throw new ApiError(
          statusCode.conflict,
          ERROR_CODES.ROUTE_MIN_STATIONS_REQUIRED,
          "Cannot schedule a train on a route with fewer than two stops.",
        );
      }

      // Check unique trainId + departureDate  constraint
      const existing = await this.scheduleRepository.getByTrainAndDate(
        dto.trainId,
        normalizedDate,
        tx,
      );
      if (existing) {
        throw new ApiError(
          statusCode.conflict,
          COMMON_ERROR_CODES.INVALID_INPUT,
          "Train is already scheduled for this departure date.",
        );
      }

      const schedule = await this.scheduleRepository.create(
        {
          trainId: dto.trainId,
          departureDate: normalizedDate,
          status: ScheduleStatus.ACTIVE, // Default status is ACTIVE
        },
        tx,
      );

      // Load nested snapshots for outbox event
      const scheduleDetails = await this.scheduleRepository.getById(
        schedule.id,
        tx,
      );
      if (!scheduleDetails) {
        throw new ApiError(
          statusCode.notFound,
          COMMON_ERROR_CODES.INVALID_INPUT,
          "schedule not found",
        );
      }

      await this.outboxRepository.insert(tx, {
        aggregateType: "SCHEDULE",
        aggregateId: schedule.id,
        eventType: EVENT_TYPES.SCHEDULE_CREATED,
        topic: KAFKA_TOPICS.SCHEDULE_CREATED,
        payload: ScheduleEventMapper.toCreatedEvent(scheduleDetails),
        headers: {
          [KAFKA_HEADERS.SCHEMA_VERSION]: "1",
          [KAFKA_HEADERS.EVENT_TYPE]: EVENT_TYPES.SCHEDULE_CREATED,
        },
      });

      return schedule;
    });
  }

  /**
   * Retrieves a schedule by its unique ID.
   *
   * @param id The unique schedule ID.
   * @throws {ApiError} If the schedule is not found.
   * @returns A promise resolving to the schedule.
   */
  async getScheduleById(id: string) {
    const schedule = await this.scheduleRepository.getById(id);
    if (!schedule) {
      throw new ApiError(
        statusCode.notFound,
        COMMON_ERROR_CODES.INVALID_INPUT,
        "Schedule not found.",
      );
    }
    return schedule;
  }

  /**
   * Updates a schedule's status (e.g., cancelling the schedule).
   *
   * @param id The unique ID of the schedule.
   * @param dto UpdateScheduleStatusRequestDto containing the new status.
   * @throws {ApiError} If schedule is not found.
   * @returns A promise resolving to the updated schedule.
   */
  async updateScheduleStatus(id: string, dto: UpdateScheduleStatusRequestDto) {
    return this.prisma.$transaction(async (tx) => {
      const schedule = await this.scheduleRepository.getById(id, tx);
      if (!schedule) {
        throw new ApiError(
          statusCode.notFound,
          COMMON_ERROR_CODES.INVALID_INPUT,
          "Schedule not found.",
        );
      }

      if (schedule.status === dto.status) {
        return schedule;
      }

      const updatedSchedule = await this.scheduleRepository.update(
        id,
        { status: dto.status, version: { increment: 1 } },
        tx,
      );

      // Load full layout snapshot for status changed outbox event
      const scheduleDetails = await this.scheduleRepository.getById(id, tx);
      if (!scheduleDetails) {
        throw new ApiError(
          statusCode.notFound,
          COMMON_ERROR_CODES.INVALID_INPUT,
          "schedule not found",
        );
      }

      await this.outboxRepository.insert(tx, {
        aggregateType: "SCHEDULE",
        aggregateId: id,
        eventType: EVENT_TYPES.SCHEDULE_STATUS_CHANGED,
        topic: KAFKA_TOPICS.SCHEDULE_STATUS_CHANGED,
        payload: ScheduleEventMapper.toStatusChangedEvent(scheduleDetails),
        headers: {
          [KAFKA_HEADERS.SCHEMA_VERSION]: "1",
          [KAFKA_HEADERS.EVENT_TYPE]: EVENT_TYPES.SCHEDULE_STATUS_CHANGED,
        },
      });

      return updatedSchedule;
    });
  }

  /**
   * Lists all schedules matching the filters and pagination queries.
   *
   * @param query Filters and pagination criteria.
   * @returns A promise resolving to the paginated list of schedules.
   */
  async listSchedules(query: ListSchedulesQueryDto) {
    const { page, limit, trainId, status } = query;
    const skip = (page - 1) * limit;

    const filters = { trainId, status };

    const [data, total] = await Promise.all([
      this.scheduleRepository.listSchedules(filters, { skip, take: limit }),
      this.scheduleRepository.countSchedules(filters),
    ]);

    return {
      data,
      metadata: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
