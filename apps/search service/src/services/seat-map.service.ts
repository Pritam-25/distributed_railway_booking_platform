import { createHash } from "node:crypto";
import type { Redis } from "@irctc/redis";
import {
  type GetSeatMapRequest,
  type GetSeatMapResponse as GrpcGetSeatMapResponse,
} from "@irctc/contracts";
import { ApiError } from "@irctc/errors";
import { logger } from "@irctc/logger";
import { statusCode } from "@irctc/http";
import { env } from "@config";
import type { TrainSearchRepository } from "@repository";
import {
  type SeatMapParamsDto,
  type SeatMapQueryDto,
  type SeatMapResponseDto,
} from "@dto";
import { SeatMapMapper } from "@mappers";
import { ERROR_CODES } from "@utils/errors";
import { InventoryAdapter } from "@grpc";

/**
 * ## SeatMapService
 *
 * Domain service powering `GET /api/v1/search/schedules/:scheduleId/seat-map`.
 */
export class SeatMapService {
  /**
   * Creates an instance of SeatMapService.
   *
   * @param inventoryAdapter - InventoryAdapter instance.
   * @param trainSearchRepository - Elasticsearch train-schedule repository
   *   used for the optional fast-404 pre-check.
   * @param redis - Redis client for the seat-map cache-aside.
   */
  constructor(
    private readonly inventoryAdapter: InventoryAdapter,
    private readonly trainSearchRepository: TrainSearchRepository,
    private readonly redis: Redis,
  ) {}

  /**
   * Resolves the seat-map for a `(scheduleId, fromStationId, toStationId)` segment.
   *
   * @param params - Validated route path params identifying the schedule.
   * @param query - Validated {@link SeatMapQueryDto} containing station origin and destination IDs.
   * @param headers - Optional HTTP headers (e.g. from Express request) to propagate as gRPC metadata.
   * @returns Promise resolving to the complete {@link SeatMapResponseDto}.
   */
  async getSeatMap(
    params: SeatMapParamsDto,
    query: SeatMapQueryDto,
    headers?: Record<string, string | string[] | undefined>,
  ): Promise<SeatMapResponseDto> {
    const cacheKey = this.buildCacheKey(params.scheduleId, query);

    const headerVal = Array.isArray(headers?.["cache-control"])
      ? headers?.["cache-control"].join(",")
      : headers?.["cache-control"];
    const pragmaVal = Array.isArray(headers?.["pragma"])
      ? headers?.["pragma"].join(",")
      : headers?.["pragma"];

    const noCache = headerVal?.includes("no-cache") || pragmaVal === "no-cache";

    if (!noCache && env.SEAT_MAP_CACHE_TTL_SECONDS > 0) {
      const cached = await this.tryReadCache(cacheKey);
      if (cached) return cached;
    }

    await this.precheckSchedule(params.scheduleId);
    const grpcResponse = await this.callInventoryGetSeatMap(
      {
        scheduleId: params.scheduleId,
        fromStationId: query.fromStation,
        toStationId: query.toStation,
      },
      headers,
    );

    this.validateGrpcResponseStatus(grpcResponse.status);

    const response = SeatMapMapper.toResponseDto(grpcResponse);
    await this.tryWriteCache(cacheKey, response);
    return response;
  }

  private buildCacheKey(scheduleId: string, query: SeatMapQueryDto): string {
    const normalized = [
      scheduleId.trim().toLowerCase(),
      query.fromStation.trim().toLowerCase(),
      query.toStation.trim().toLowerCase(),
    ].join("|");

    const hash = createHash("sha1")
      .update(normalized)
      .digest("hex")
      .slice(0, 16);
    return `${env.SEAT_MAP_CACHE_KEY_PREFIX}:v1:${hash}`;
  }

  private async precheckSchedule(scheduleId: string): Promise<void> {
    try {
      const scheduleDoc =
        await this.trainSearchRepository.findScheduleById(scheduleId);
      if (!scheduleDoc) {
        throw new ApiError(
          statusCode.notFound,
          ERROR_CODES.SCHEDULE_NOT_FOUND,
          "No train schedule found matching the requested id.",
        );
      }
    } catch (err) {
      if (err instanceof ApiError) throw err;
      logger.warn(
        { module: "seat-map-service", scheduleId, err },
        "Elasticsearch seat-map pre-check failed; falling through to gRPC",
      );
    }
  }

  private async callInventoryGetSeatMap(
    request: GetSeatMapRequest,
    headers?: Record<string, string | string[] | undefined>,
  ): Promise<GrpcGetSeatMapResponse> {
    return await this.inventoryAdapter.getSeatMap(request, headers);
  }

  private validateGrpcResponseStatus(status: string): void {
    if (status === "SCHEDULE_NOT_FOUND") {
      throw new ApiError(
        statusCode.notFound,
        ERROR_CODES.SCHEDULE_NOT_FOUND,
        "No schedule found for the requested id.",
      );
    }
    if (status === "SCHEDULE_INACTIVE") {
      throw new ApiError(
        statusCode.conflict,
        ERROR_CODES.SCHEDULE_INACTIVE,
        "Schedule is not active or the requested segment is invalid.",
      );
    }
  }

  private async tryReadCache(key: string): Promise<SeatMapResponseDto | null> {
    try {
      const cachedJson = await this.redis.get(key);
      if (!cachedJson) return null;

      const parsed = JSON.parse(cachedJson) as SeatMapResponseDto;
      logger.info({ module: "seat-map-service", key }, "Redis cache HIT");
      return parsed;
    } catch (err) {
      logger.warn(
        { module: "seat-map-service", key, err },
        "Redis read failed; continuing cache-miss path",
      );
      return null;
    }
  }

  private async tryWriteCache(
    key: string,
    payload: SeatMapResponseDto,
  ): Promise<void> {
    if (env.SEAT_MAP_CACHE_TTL_SECONDS <= 0) return;
    try {
      const serialized = JSON.stringify(payload);
      await this.redis.set(
        key,
        serialized,
        "EX",
        env.SEAT_MAP_CACHE_TTL_SECONDS,
      );
    } catch (err) {
      logger.warn(
        { module: "seat-map-service", key, err },
        "Redis write failed; continuing without caching",
      );
    }
  }
}
