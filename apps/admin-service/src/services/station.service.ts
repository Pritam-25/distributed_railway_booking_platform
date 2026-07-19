import { Prisma, type PrismaClient } from "@generated/prisma/client.js";
import { ApiError } from "@irctc/errors";
import { ERROR_CODES } from "@utils/errors";
import { statusCode } from "@irctc/http";
import type { StationRepository } from "@repository";
import { type OutboxRepository } from "@irctc/kafka";
import type {
  CreateStationRequestDto,
  ListStationsQueryDto,
  UpdateStationRequestDto,
  StationFilters,
} from "@dto";
import { StationEventMapper } from "@mappers";
import { KAFKA_HEADERS } from "@irctc/kafka";
import { EVENT_TYPES, KAFKA_TOPICS } from "@irctc/contracts";

/**
 * Service class that handles station domain logic, business validations,
 * transaction orchestration, and outbox event publishing.
 */
export class StationService {
  /**
   * Creates an instance of StationService.
   *
   * @param prisma The Prisma client instance for database transaction orchestration.
   * @param stationRepository The repository for station-related database operations.
   * @param outboxRepository The repository for transactional outbox event lifecycle management.
   */
  constructor(
    private readonly prisma: PrismaClient,
    private readonly stationRepository: StationRepository,
    private readonly outboxRepository: OutboxRepository,
  ) {}

  /**
   * Helper method to ensure that a station code is unique before creation.
   * Throws an ApiError (Conflict) if the station code already exists in the system.
   *
   * @param code The station code to validate (e.g., "NDLS").
   * @throws {ApiError} If the station code already exists.
   * @returns A promise that resolves when uniqueness is confirmed.
   */
  private async ensureUniqueCode(code: string, tx?: Prisma.TransactionClient) {
    const existing = await this.stationRepository.getStationByCode(code, tx);
    if (existing) {
      throw new ApiError(
        statusCode.conflict,
        ERROR_CODES.STATION_ALREADY_EXISTS,
      );
    }
  }

  /**
   * Orchestrates the creation of a new station.
   * Runs validation, creates the station record, and inserts a transaction-bound outbox event
   * for Kafka publishing inside a single Prisma transaction block.
   *
   * @param dto The data transfer object containing station details.
   * @returns A promise that resolves to the newly created station record.
   */
  async createStation(dto: CreateStationRequestDto) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.ensureUniqueCode(dto.code, tx);
        const station = await this.stationRepository.create(
          {
            name: dto.name,
            code: dto.code,
            zone: dto.zone ?? null,
            isActive: dto.isActive,
            state: dto.state ?? null,
          },
          tx,
        );

        await this.outboxRepository.insert(tx, {
          aggregateType: "STATION",
          aggregateId: station.id,
          eventType: EVENT_TYPES.STATION_CREATED,
          topic: KAFKA_TOPICS.STATION_CREATED,
          payload: StationEventMapper.toCreatedEvent(station),
          headers: {
            [KAFKA_HEADERS.SCHEMA_VERSION]: "1",
            [KAFKA_HEADERS.EVENT_TYPE]: EVENT_TYPES.STATION_CREATED,
          },
        });

        return station;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ApiError(
          statusCode.conflict,
          ERROR_CODES.STATION_ALREADY_EXISTS,
        );
      }
      throw error;
    }
  }

  /**
   * Retrieves a station by its unique ID.
   * Throws an ApiError (NotFound) if the station does not exist.
   *
   * @param stationId The unique ID of the station to retrieve.
   * @throws {ApiError} If the station is not found.
   * @returns A promise that resolves to the station record.
   */
  async getStationById(stationId: string) {
    const station = await this.stationRepository.getStationById(stationId);
    if (!station) {
      throw new ApiError(statusCode.notFound, ERROR_CODES.STATION_NOT_FOUND);
    }
    return station;
  }

  /**
   * Retrieves a paginated list of stations matching optional filtering parameters.
   * If no filters are provided, applies a default filter to only list active stations (isActive: true).
   *
   * @param query The filtering and pagination request query payload.
   * @returns A promise that resolves to a paginated object containing the stations array and pagination metadata.
   */
  async listStations(query: ListStationsQueryDto) {
    const { code, zone, state, isActive, page, limit } = query;

    // Check if any filtering parameter is present
    const hasFilter =
      (code !== undefined && code.trim() !== "") ||
      (zone !== undefined && zone.trim() !== "") ||
      (state !== undefined && state.trim() !== "") ||
      isActive !== undefined;

    // Apply default filter (isActive: true) if no specific filters are requested
    const filters: StationFilters = hasFilter
      ? { code, zone, state, isActive }
      : { isActive: true };

    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.stationRepository.listStations(filters, { skip, take: limit }),
      this.stationRepository.countStations(filters),
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
   * Updates an existing station's details and triggers a transactional outbox update event.
   * If the station code is being changed, ensures the new code is unique.
   *
   * @param stationId The unique ID of the station to update.
   * @param dto The partial update details.
   * @throws {ApiError} If the station is not found or the new code conflicts with an existing one.
   * @returns A promise that resolves when the update transaction finishes.
   */
  async updateStation(stationId: string, dto: UpdateStationRequestDto) {
    try {
      const updatedData = Object.fromEntries(
        Object.entries(dto).filter(([_, value]) => value !== undefined),
      );

      return await this.prisma.$transaction(async (tx) => {
        const station = await this.stationRepository.getStationById(
          stationId,
          tx,
        );

        if (!station) {
          throw new ApiError(
            statusCode.notFound,
            ERROR_CODES.STATION_NOT_FOUND,
          );
        }

        if (dto.code && dto.code !== station.code) {
          await this.ensureUniqueCode(dto.code, tx);
        }

        const updatedStation = await this.stationRepository.update(
          stationId,
          updatedData,
          tx,
        );

        await this.outboxRepository.insert(tx, {
          aggregateType: "STATION",
          aggregateId: updatedStation.id,
          eventType: EVENT_TYPES.STATION_UPDATED,
          topic: KAFKA_TOPICS.STATION_UPDATED,
          payload: StationEventMapper.toUpdatedEvent(updatedStation),
          headers: {
            [KAFKA_HEADERS.SCHEMA_VERSION]: "1",
            [KAFKA_HEADERS.EVENT_TYPE]: EVENT_TYPES.STATION_UPDATED,
          },
        });

        return updatedStation;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ApiError(
          statusCode.conflict,
          ERROR_CODES.STATION_ALREADY_EXISTS,
        );
      }
      throw error;
    }
  }

  /**
   * Deactivates a station by marking isActive as false and logs a deactivation outbox event.
   *
   * @param stationId The unique ID of the station to deactivate.
   * @throws {ApiError} If the station is not found.
   * @returns A promise that resolves to the deactivated station record.
   */
  async deactivateStation(stationId: string) {
    return this.prisma.$transaction(async (tx) => {
      const station = await this.stationRepository.getStationById(
        stationId,
        tx,
      );
      if (!station) {
        throw new ApiError(statusCode.notFound, ERROR_CODES.STATION_NOT_FOUND);
      }

      if (!station.isActive) {
        return station;
      }

      const deactivatedStation = await this.stationRepository.update(
        stationId,
        { isActive: false },
        tx,
      );

      await this.outboxRepository.insert(tx, {
        aggregateType: "STATION",
        aggregateId: deactivatedStation.id,
        eventType: EVENT_TYPES.STATION_DEACTIVATED,
        topic: KAFKA_TOPICS.STATION_DEACTIVATED,
        payload: StationEventMapper.toDeactivatedEvent(deactivatedStation),
        headers: {
          [KAFKA_HEADERS.SCHEMA_VERSION]: "1",
          [KAFKA_HEADERS.EVENT_TYPE]: EVENT_TYPES.STATION_DEACTIVATED,
        },
      });

      return deactivatedStation;
    });
  }
}
