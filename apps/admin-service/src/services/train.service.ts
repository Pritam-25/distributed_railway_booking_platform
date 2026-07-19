import { Prisma, type PrismaClient } from "@generated/prisma/client.js";
import { ApiError } from "@irctc/errors";
import { ERROR_CODES } from "@utils/errors";
import { statusCode } from "@irctc/http";
import type { TrainRepository, ScheduleRepository } from "@repository";
import { type OutboxRepository } from "@irctc/kafka";
import type {
  CreateTrainRequestDto,
  ListTrainsQueryDto,
  UpdateTrainRequestDto,
  UpdateOperatingDaysDto,
} from "@dto";
import { TrainEventMapper } from "@mappers";
import { KAFKA_HEADERS } from "@irctc/kafka";
import { EVENT_TYPES, KAFKA_TOPICS } from "@irctc/contracts";

/**
 * Service class that handles train domain logic, business validations,
 * transaction orchestration, and outbox event publishing.
 */
export class TrainService {
  /**
   * Creates an instance of TrainService.
   *
   * @param prisma The Prisma client instance for database transaction orchestration.
   * @param trainRepository The repository for train-related database operations.
   * @param outboxRepository The repository for transactional outbox event lifecycle management.
   * @param scheduleRepository The repository for schedule-related database operations.
   */
  constructor(
    private readonly prisma: PrismaClient,
    private readonly trainRepository: TrainRepository,
    private readonly outboxRepository: OutboxRepository,
    private readonly scheduleRepository: ScheduleRepository,
  ) {}

  /**
   * Helper method to ensure that a train number is unique before creation/update.
   * Throws an ApiError (Conflict) if the train number already exists in the system.
   *
   * @param trainNumber The train number to validate (e.g., "12345").
   * @throws {ApiError} If the train number already exists.
   * @returns A promise that resolves when uniqueness is confirmed.
   */
  private async ensureUniqueTrainNumber(
    trainNumber: string,
    tx?: Prisma.TransactionClient,
  ) {
    const existing = await this.trainRepository.getTrainByNumber(
      trainNumber,
      tx,
    );
    if (existing) {
      throw new ApiError(statusCode.conflict, ERROR_CODES.TRAIN_ALREADY_EXISTS);
    }
  }

  /**
   * Orchestrates the creation of a new train.
   * Runs validation, creates the train record, and inserts a transaction-bound outbox event
   * for Kafka publishing inside a single Prisma transaction block.
   * Catches database P2002 unique constraint violations as a fallback for concurrent duplicate inserts.
   *
   * @param dto The data transfer object containing train details.
   * @returns A promise that resolves to the newly created train record.
   * @throws {ApiError} If the train number conflicts with an existing train.
   */
  async createTrain(dto: CreateTrainRequestDto) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.ensureUniqueTrainNumber(dto.trainNumber, tx);

        const train = await this.trainRepository.create(
          {
            trainNumber: dto.trainNumber,
            trainName: dto.trainName,
            category: dto.category,
            isActive: dto.isActive,
          },
          tx,
        );

        // partition key = trainId
        await this.outboxRepository.insert(tx, {
          aggregateType: "TRAIN",
          aggregateId: train.id,
          eventType: EVENT_TYPES.TRAIN_CREATED,
          topic: KAFKA_TOPICS.TRAIN_CREATED,
          payload: TrainEventMapper.toCreatedEvent(train),
          headers: {
            [KAFKA_HEADERS.SCHEMA_VERSION]: "1",
            [KAFKA_HEADERS.EVENT_TYPE]: EVENT_TYPES.TRAIN_CREATED,
          },
        });

        return train;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ApiError(
          statusCode.conflict,
          ERROR_CODES.TRAIN_ALREADY_EXISTS,
        );
      }
      throw error;
    }
  }

  /**
   * Retrieves a train by its unique ID.
   * Throws an ApiError (NotFound) if the train does not exist.
   *
   * @param trainId The unique ID of the train to retrieve.
   * @throws {ApiError} If the train is not found.
   * @returns A promise that resolves to the train record.
   */
  async getTrainById(trainId: string) {
    const train = await this.trainRepository.getTrainById(trainId);
    if (!train) {
      throw new ApiError(statusCode.notFound, ERROR_CODES.TRAIN_NOT_FOUND);
    }
    return train;
  }

  /**
   * Retrieves a paginated list of trains matching optional filtering parameters.
   * If no filters are provided, applies a default filter to only list active trains (isActive: true).
   *
   * @param query The filtering and pagination request query payload.
   * @returns A promise that resolves to a paginated object containing the trains array and pagination metadata.
   */
  async listTrains(query: ListTrainsQueryDto) {
    const { trainNumber, category, isActive, page, limit } = query;

    const hasFilter =
      (trainNumber !== undefined && trainNumber.trim() !== "") ||
      category !== undefined ||
      isActive !== undefined;

    const filters = hasFilter
      ? { trainNumber, category, isActive }
      : { isActive: true };

    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.trainRepository.listTrains(filters, { skip, take: limit }),
      this.trainRepository.countTrains(filters),
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

  /**
   * Updates an existing train's details and triggers a transactional outbox update event.
   * If the train number is being changed, ensures the new number is unique.
   * Catches database P2002 unique constraint violations if the new train number conflicts with another existing train.
   *
   * @param trainId The unique ID of the train to update.
   * @param dto The partial update details.
   * @returns A promise that resolves when the update transaction finishes.
   * @throws {ApiError} If the train is not found, or if the updated train number is already taken by another train.
   */
  async updateTrain(trainId: string, dto: UpdateTrainRequestDto) {
    try {
      const updatedData = Object.fromEntries(
        Object.entries(dto).filter(([_, value]) => value !== undefined),
      );

      return await this.prisma.$transaction(async (tx) => {
        const train = await this.trainRepository.getTrainById(trainId, tx);

        if (!train) {
          throw new ApiError(statusCode.notFound, ERROR_CODES.TRAIN_NOT_FOUND);
        }

        if (dto.trainNumber && dto.trainNumber !== train.trainNumber) {
          await this.ensureUniqueTrainNumber(dto.trainNumber, tx);
        }

        const updatedTrain = await this.trainRepository.update(
          trainId,
          updatedData,
          tx,
        );

        await this.outboxRepository.insert(tx, {
          aggregateType: "TRAIN",
          aggregateId: updatedTrain.id,
          eventType: EVENT_TYPES.TRAIN_UPDATED,
          topic: KAFKA_TOPICS.TRAIN_UPDATED,
          payload: TrainEventMapper.toUpdatedEvent(updatedTrain),
          headers: {
            [KAFKA_HEADERS.SCHEMA_VERSION]: "1",
            [KAFKA_HEADERS.EVENT_TYPE]: EVENT_TYPES.TRAIN_UPDATED,
          },
        });

        return updatedTrain;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ApiError(
          statusCode.conflict,
          ERROR_CODES.TRAIN_ALREADY_EXISTS,
        );
      }
      throw error;
    }
  }

  /**
   * Deactivates a train by marking isActive as false and logs a deactivation outbox event.
   *
   * @param trainId The unique ID of the train to deactivate.
   * @throws {ApiError} If the train is not found.
   * @returns A promise that resolves to the deactivated train record.
   */
  async deactivateTrain(trainId: string) {
    return this.prisma.$transaction(async (tx) => {
      const train = await this.trainRepository.getTrainById(trainId, tx);
      if (!train) {
        throw new ApiError(statusCode.notFound, ERROR_CODES.TRAIN_NOT_FOUND);
      }
      if (!train.isActive) {
        return train;
      }
      const deactivatedTrain = await this.trainRepository.update(
        trainId,
        { isActive: false },
        tx,
      );

      await this.outboxRepository.insert(tx, {
        aggregateType: "TRAIN",
        aggregateId: deactivatedTrain.id,
        eventType: EVENT_TYPES.TRAIN_DEACTIVATED,
        topic: KAFKA_TOPICS.TRAIN_DEACTIVATED,
        payload: TrainEventMapper.toDeactivatedEvent(deactivatedTrain),
        headers: {
          [KAFKA_HEADERS.SCHEMA_VERSION]: "1",
          [KAFKA_HEADERS.EVENT_TYPE]: EVENT_TYPES.TRAIN_DEACTIVATED,
        },
      });

      return deactivatedTrain;
    });
  }

  /**
   * Updates a train's operating days.
   * Ensures the train exists and verifies that no active future schedules exist on the days being removed.
   *
   * @param trainId The unique ID of the train.
   * @param dto DTO containing the array of new operating days.
   * @returns A promise resolving to the list of new operating days.
   * @throws {ApiError} If train is not found, or if any active future schedule conflicts with the removed days.
   */
  async updateTrainOperatingDays(trainId: string, dto: UpdateOperatingDaysDto) {
    const { operatingDays: newDays } = dto;

    return this.prisma.$transaction(async (tx) => {
      // 1. Ensure train exists
      const train = await this.trainRepository.getTrainById(trainId, tx);
      if (!train) {
        throw new ApiError(statusCode.notFound, ERROR_CODES.TRAIN_NOT_FOUND);
      }

      // 2. Identify operating days being removed (e.g., current: [0, 1, 2], new: [0, 1], removed: [2])
      const currentDays = train.operatingDays.map((d) => d.dayOfWeek);
      const removedDays = currentDays.filter((day) => !newDays.includes(day));

      if (removedDays.length > 0) {
        // 3. Prevent removing days that have active future schedules
        const futureSchedules =
          await this.scheduleRepository.getFutureActiveSchedules(trainId, tx);

        for (const schedule of futureSchedules) {
          const dayOfWeek = schedule.departureDate.getUTCDay();
          if (removedDays.includes(dayOfWeek)) {
            throw new ApiError(
              statusCode.conflict,
              ERROR_CODES.TRAIN_OPERATING_DAYS_REFERENCED,
            );
          }
        }
      }

      // 4. Update the operating days in the database
      await this.trainRepository.updateOperatingDays(trainId, newDays, tx);

      return newDays;
    });
  }
}
