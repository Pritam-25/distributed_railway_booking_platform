import { Prisma, type PrismaClient } from "@generated/prisma/client.js";
import { ApiError, ERROR_CODES as COMMON_ERROR_CODES } from "@irctc/errors";
import { ERROR_CODES } from "@utils/errors";
import { statusCode } from "@irctc/http";
import type {
  CoachRepository,
  TrainRepository,
  SeatRepository,
} from "@repository";
import { KAFKA_HEADERS, type OutboxRepository } from "@irctc/kafka";
import {
  type CreateCoachRequestDto,
  type UpdateCoachRequestDto,
  COACH_CAPACITY,
} from "@dto";
import { CoachEventMapper } from "@mappers";
import { EVENT_TYPES, KAFKA_TOPICS } from "@irctc/contracts";

/**
 * Service class handling coach domain logic, business validations, and Kafka updates.
 */
export class CoachService {
  /**
   * Creates an instance of CoachService.
   *
   * @param prisma The Prisma Client context.
   * @param coachRepository The repository for coach data access operations.
   * @param trainRepository The repository for train data access operations.
   * @param seatRepository The repository for seat template operations.
   * @param outboxRepository The repository for outbox transactional events.
   */
  constructor(
    private readonly prisma: PrismaClient,
    private readonly coachRepository: CoachRepository,
    private readonly trainRepository: TrainRepository,
    private readonly seatRepository: SeatRepository,
    private readonly outboxRepository: OutboxRepository,
  ) {}

  /**
   * Helper method to validate that a coach number is unique for a given train.
   * Throws an ApiError (Conflict) if the coach number is already registered for the train.
   *
   * @param trainId The unique ID of the train.
   * @param coachNumber The coach identifier number (e.g. "A1").
   * @param tx Optional transaction client context.
   * @throws {ApiError} If the coach number is already registered for the train.
   */
  private async ensureUniqueCoachNumber(
    trainId: string,
    coachNumber: string,
    tx?: Prisma.TransactionClient,
  ) {
    const existing = await this.coachRepository.getCoachByNumber(
      trainId,
      coachNumber,
      tx,
    );
    if (existing) {
      throw new ApiError(statusCode.conflict, ERROR_CODES.COACH_ALREADY_EXISTS);
    }
  }

  /**
   * Orchestrates the addition of a new coach to an existing train.
   * Runs validations, creates the coach record, and writes to the outbox for Kafka publishing
   * inside a single transaction.
   *
   * @param trainId The unique ID of the train.
   * @param dto The data transfer object containing coach details.
   * @throws {ApiError} If the train is not found or the coach number is already registered.
   * @returns A promise resolving to the created coach record.
   */
  async addCoach(trainId: string, dto: CreateCoachRequestDto) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const train = await this.trainRepository.getTrainById(trainId, tx);
        if (!train) {
          throw new ApiError(statusCode.notFound, ERROR_CODES.TRAIN_NOT_FOUND);
        }

        await this.ensureUniqueCoachNumber(trainId, dto.coachNumber, tx);

        const coach = await this.coachRepository.create(
          {
            trainId,
            coachNumber: dto.coachNumber,
            coachType: dto.coachType,
            totalSeats: dto.totalSeats,
          },
          tx,
        );

        await this.outboxRepository.insert(tx, {
          aggregateType: "COACH",
          aggregateId: coach.id,
          eventType: EVENT_TYPES.COACH_CREATED,
          topic: KAFKA_TOPICS.COACH_CREATED,
          payload: CoachEventMapper.toCreatedEvent(coach),
          headers: {
            [KAFKA_HEADERS.SCHEMA_VERSION]: "1",
            [KAFKA_HEADERS.EVENT_TYPE]: EVENT_TYPES.COACH_CREATED,
          },
        });

        return coach;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ApiError(
          statusCode.conflict,
          ERROR_CODES.COACH_ALREADY_EXISTS,
        );
      }
      throw error;
    }
  }

  /**
   * Retrieves details of a specific coach by its unique ID.
   *
   * @param coachId The unique ID of the coach to retrieve.
   * @throws {ApiError} If the coach is not found.
   * @returns A promise resolving to the coach record.
   */
  async getCoachById(coachId: string) {
    const coach = await this.coachRepository.getCoachById(coachId);
    if (!coach) {
      throw new ApiError(statusCode.notFound, ERROR_CODES.COACH_NOT_FOUND);
    }
    return coach;
  }

  /**
   * Lists all coaches belonging to a specific train.
   *
   * @param trainId The unique ID of the train.
   * @throws {ApiError} If the train is not found.
   * @returns A promise resolving to an array of coach records.
   */
  async listCoaches(trainId: string) {
    const train = await this.trainRepository.getTrainById(trainId);
    if (!train) {
      throw new ApiError(statusCode.notFound, ERROR_CODES.TRAIN_NOT_FOUND);
    }
    return this.coachRepository.listCoachesByTrainId(trainId);
  }

  /**
   * Updates fields of an existing coach.
   * Ensures capacity boundaries are respected and coach number is unique if modified.
   * Prevents changes if seats have already been generated.
   *
   * @param coachId The unique ID of the coach to update.
   * @param dto The partial coach update values payload.
   * @throws {ApiError} If the coach is not found, seats have already been generated, capacity boundaries are invalid, or coach number conflicts.
   * @returns A promise resolving to the updated coach record.
   */
  async updateCoach(coachId: string, dto: UpdateCoachRequestDto) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const coach = await this.coachRepository.getCoachById(coachId, tx);
        if (!coach) {
          throw new ApiError(statusCode.notFound, ERROR_CODES.COACH_NOT_FOUND);
        }

        // If coachType or capacity is changing, ensure no seats have been generated yet
        if (dto.coachType !== undefined || dto.totalSeats !== undefined) {
          const seatCount = await this.seatRepository.countSeatsByCoachId(
            coachId,
            tx,
          );
          if (seatCount > 0) {
            throw new ApiError(
              statusCode.conflict,
              ERROR_CODES.SEATS_ALREADY_GENERATED,
            );
          }

          // Validate capacity boundaries for updated values
          const finalType = dto.coachType ?? coach.coachType;
          const finalSeats = dto.totalSeats ?? coach.totalSeats;
          const range = COACH_CAPACITY[finalType];
          if (finalSeats < range[0] || finalSeats > range[1]) {
            throw new ApiError(
              statusCode.badRequest,
              COMMON_ERROR_CODES.INVALID_INPUT,
              `Capacity for coach type ${finalType} must be between ${range[0]} and ${range[1]} seats.`,
            );
          }
        }

        if (dto.coachNumber && dto.coachNumber !== coach.coachNumber) {
          await this.ensureUniqueCoachNumber(
            coach.trainId,
            dto.coachNumber,
            tx,
          );
        }

        const updatedData = Object.fromEntries(
          Object.entries(dto).filter(([_, value]) => value !== undefined),
        );

        return this.coachRepository.update(coachId, updatedData, tx);
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ApiError(
          statusCode.conflict,
          ERROR_CODES.COACH_ALREADY_EXISTS,
        );
      }
      throw error;
    }
  }

  /**
   * Deletes a coach from the system.
   * Prevents deletion if seats have already been generated to protect against data loss.
   *
   * @param coachId The unique ID of the coach to delete.
   * @throws {ApiError} If the coach is not found or seats have been generated.
   * @returns A promise resolving to the deleted coach record.
   */
  async deleteCoach(coachId: string) {
    return this.prisma.$transaction(async (tx) => {
      const coach = await this.coachRepository.getCoachById(coachId, tx);
      if (!coach) {
        throw new ApiError(statusCode.notFound, ERROR_CODES.COACH_NOT_FOUND);
      }

      // Check if seats have been generated. If so, fail to protect from accidental deletion.
      const seatCount = await this.seatRepository.countSeatsByCoachId(
        coachId,
        tx,
      );
      if (seatCount > 0) {
        throw new ApiError(
          statusCode.conflict,
          ERROR_CODES.SEATS_ALREADY_GENERATED,
          "Cannot delete coach because generated seats exist. Reset seats first.",
        );
      }

      return this.coachRepository.delete(coachId, tx);
    });
  }
}
