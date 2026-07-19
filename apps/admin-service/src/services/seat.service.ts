import {
  Prisma,
  type PrismaClient,
  SeatType,
  CoachType,
} from "@generated/prisma/client.js";
import { ApiError } from "@irctc/errors";
import { ERROR_CODES } from "@utils/errors";
import { statusCode } from "@irctc/http";
import type { CoachRepository, SeatRepository } from "@repository";
import { type OutboxRepository } from "@irctc/kafka";
import { SeatEventMapper } from "@mappers";
import { KAFKA_HEADERS } from "@irctc/kafka";
import { EVENT_TYPES, KAFKA_TOPICS } from "@irctc/contracts";

/**
 * Determines the seat / berth type based on standard Indian Railways patterns.
 *
 * @param seatNumber The position number of the seat.
 * @param coachType The type classification of the coach.
 * @returns The determined SeatType enum value.
 */
export const determineSeatType = (
  seatNumber: number,
  coachType: CoachType,
): SeatType => {
  if (
    coachType === CoachType.SL ||
    coachType === CoachType.AC_3A ||
    coachType === CoachType.AC_3E
  ) {
    const stop = seatNumber % 8;
    if (stop === 1 || stop === 4) return SeatType.LOWER;
    if (stop === 2 || stop === 5) return SeatType.MIDDLE;
    if (stop === 3 || stop === 6) return SeatType.UPPER;
    if (stop === 7) return SeatType.SIDE_LOWER;
    return SeatType.SIDE_UPPER; // 0
  }

  if (coachType === CoachType.AC_2A) {
    const stop = seatNumber % 6;
    if (stop === 1 || stop === 3) return SeatType.LOWER;
    if (stop === 2 || stop === 4) return SeatType.UPPER;
    if (stop === 5) return SeatType.SIDE_LOWER;
    return SeatType.SIDE_UPPER; // 0
  }

  if (coachType === CoachType.AC_1A) {
    const stop = seatNumber % 2;
    return stop === 1 ? SeatType.LOWER : SeatType.UPPER;
  }

  // CC, EC, GEN default to sitting layout
  return SeatType.LOWER;
};

/**
 * Service class handling bulk seat template generation, query lookups, and resets.
 */
export class SeatService {
  /**
   * Creates an instance of SeatService.
   *
   * @param prisma The Prisma Client context.
   * @param coachRepository The repository for coach data access.
   * @param seatRepository The repository for seat data access.
   * @param outboxRepository The repository for outbox transactional events.
   */
  constructor(
    private readonly prisma: PrismaClient,
    private readonly coachRepository: CoachRepository,
    private readonly seatRepository: SeatRepository,
    private readonly outboxRepository: OutboxRepository,
  ) {}

  /**
   * Generates seat templates in bulk for a given coach inside a single database transaction.
   * Resolves the coach's layout type and inserts the appropriate seat configurations.
   * Publishes a KAFKA outbox event upon successful generation.
   *
   * @param coachId The unique ID of the coach.
   * @throws {ApiError} If the coach is not found or seats have already been generated.
   * @returns A promise resolving to the count of generated seats.
   */
  async bulkCreateSeats(coachId: string) {
    return this.prisma.$transaction(async (tx) => {
      const coach = await this.coachRepository.getCoachById(coachId, tx);
      if (!coach) {
        throw new ApiError(statusCode.notFound, ERROR_CODES.COACH_NOT_FOUND);
      }

      const existingSeatsCount = await this.seatRepository.countSeatsByCoachId(
        coachId,
        tx,
      );
      if (existingSeatsCount > 0) {
        throw new ApiError(
          statusCode.conflict,
          ERROR_CODES.SEATS_ALREADY_GENERATED,
        );
      }

      const seatsToCreate: Prisma.SeatCreateManyInput[] = [];
      for (let i = 1; i <= coach.totalSeats; i++) {
        seatsToCreate.push({
          coachId,
          seatNumber: i,
          seatType: determineSeatType(i, coach.coachType),
        });
      }

      await this.seatRepository.bulkCreate(seatsToCreate, tx);

      await this.outboxRepository.insert(tx, {
        aggregateType: "SEAT_TEMPLATE",
        aggregateId: coach.id,
        eventType: EVENT_TYPES.SEAT_TEMPLATE_CREATED,
        topic: KAFKA_TOPICS.SEAT_TEMPLATE_CREATED,
        payload: SeatEventMapper.toCreatedEvent(coach),
        headers: {
          [KAFKA_HEADERS.SCHEMA_VERSION]: "1",
          [KAFKA_HEADERS.EVENT_TYPE]: EVENT_TYPES.SEAT_TEMPLATE_CREATED,
        },
      });

      return { count: coach.totalSeats };
    });
  }

  /**
   * Lists all generated seat templates for a specific coach.
   *
   * @param coachId The unique ID of the coach.
   * @throws {ApiError} If the coach is not found.
   * @returns A promise resolving to an array of seat records.
   */
  async listSeats(coachId: string) {
    const coach = await this.coachRepository.getCoachById(coachId);
    if (!coach) {
      throw new ApiError(statusCode.notFound, ERROR_CODES.COACH_NOT_FOUND);
    }
    return this.seatRepository.listSeatsByCoachId(coachId);
  }

  /**
   * Retrieves details of a specific seat template under a given coach.
   *
   * @param coachId The unique ID of the coach.
   * @param seatId The unique ID of the seat.
   * @throws {ApiError} If the coach is not found, the seat is not found, or they don't match.
   * @returns A promise resolving to the seat record.
   */
  async getSeatById(coachId: string, seatId: string) {
    const coach = await this.coachRepository.getCoachById(coachId);
    if (!coach) {
      throw new ApiError(statusCode.notFound, ERROR_CODES.COACH_NOT_FOUND);
    }

    const seat = await this.seatRepository.getSeatById(seatId);
    if (seat?.coachId !== coachId) {
      throw new ApiError(statusCode.notFound, ERROR_CODES.SEAT_NOT_FOUND);
    }

    return seat;
  }

  /**
   * Deletes all generated seat templates for a specific coach, resetting the generation state.
   *
   * @param coachId The unique ID of the coach.
   * @throws {ApiError} If the coach is not found.
   * @returns A promise resolving to the count of deleted seats.
   */
  async resetSeats(coachId: string) {
    return this.prisma.$transaction(async (tx) => {
      const coach = await this.coachRepository.getCoachById(coachId, tx);
      if (!coach) {
        throw new ApiError(statusCode.notFound, ERROR_CODES.COACH_NOT_FOUND);
      }

      const count = await this.seatRepository.countSeatsByCoachId(coachId, tx);
      if (count === 0) {
        return { count: 0 };
      }

      await this.seatRepository.deleteSeatsByCoachId(coachId, tx);
      return { count };
    });
  }
}
