import { createHash } from "node:crypto";
import type { Redis } from "@irctc/redis";

import {
  type GetSeatMapRequest,
  type GetSeatMapResponse as GrpcGetSeatMapResponse,
  type InventoryServiceClient,
} from "@irctc/contracts";
import {
  ClientError,
  createRpcMetadata,
  mapGrpcClientErrorToApiError,
} from "@irctc/grpc";
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

/**
 * ## SeatMapService
 *
 * Domain service powering `GET /api/v1/search/schedules/:scheduleId/seat-map`.
 *
 * @remarks
 * ### Responsibilities
 * - Reads and writes the seat-map cache-aside in Redis.
 * - Optionally pre-checks the schedule against the Elasticsearch
 *   `train_schedules` projection to deliver a clear 404 before reaching
 *   the gRPC boundary.
 * - Translates the inventory-service gRPC response into the public DTO.
 * - Translates `ClientError` from `@irctc/grpc` into {@link ApiError} so
 *   the HTTP layer can render the right status code.
 *
 * ### Storage & Persistence
 * - **Redis**: Read-through result cache (`cache:seat-map:v1:<hash>`),
 *   keyed by `(scheduleId, fromStationId, toStationId)`.
 * - **Elasticsearch**: Optional fast 404 via `train_schedules` projection.
 * - **gRPC → inventory-service**: Authoritative source for coach layout
 *   and per-segment booking overlay.
 */
export class SeatMapService {
  /**
   * Creates an instance of SeatMapService.
   *
   * @param inventoryGrpcClient - Shared InventoryService gRPC client.
   * @param trainSearchRepository - Elasticsearch train-schedule repository
   *   used for the optional fast-404 pre-check.
   * @param redis - Redis client for the seat-map cache-aside.
   */
  constructor(
    private readonly inventoryGrpcClient: InventoryServiceClient,
    private readonly trainSearchRepository: TrainSearchRepository,
    private readonly redis: Redis,
  ) {}

  /**
   * Resolves the seat-map for a `(scheduleId, fromStationId, toStationId)` segment.
   *
   * @remarks
   * Side effects: Redis cache-aside reads/writes, optional Elasticsearch pre-check, gRPC to inventory-service.
   *
   * Failure guarantees: cache failures degrade gracefully; gRPC NOT_FOUND/INVALID translate to HTTP 404/409 via {@link ApiError}.
   * @param params - Validated route path params identifying the schedule.
   * @param query - Validated {@link SeatMapQueryDto} containing station origin and destination IDs.
   * @param headers - Optional HTTP headers (e.g. from Express request) to propagate as gRPC metadata.
   * @returns Promise resolving to the complete {@link SeatMapResponseDto}.
   * @throws {ApiError} (404) If schedule does not exist (`SCHEDULE_NOT_FOUND`).
   * @throws {ApiError} (409) If schedule is inactive or segment is invalid (`SCHEDULE_INACTIVE`).
   * @throws {ApiError} (500) If gRPC network/client error occurs (`INTERNAL_ERROR`).
   */
  async getSeatMap(
    params: SeatMapParamsDto,
    query: SeatMapQueryDto,
    headers?: Record<string, string | undefined>,
  ): Promise<SeatMapResponseDto> {
    logger.debug(
      { module: "seat-map-service", scheduleId: params.scheduleId },
      "1. Starting getSeatMap execution",
    );

    const cacheKey = this.buildCacheKey(params.scheduleId, query);

    logger.debug(
      { module: "seat-map-service", cacheKey },
      "2. Reading Redis cache",
    );
    const cached = await this.tryReadCache(cacheKey);
    if (cached) return cached;

    logger.debug(
      { module: "seat-map-service", scheduleId: params.scheduleId },
      "3. Running precheckSchedule against Elasticsearch",
    );
    await this.precheckSchedule(params.scheduleId);

    logger.debug(
      { module: "seat-map-service", scheduleId: params.scheduleId },
      "4. Calling callInventoryGetSeatMap gRPC",
    );
    const grpcResponse = await this.callInventoryGetSeatMap(
      {
        scheduleId: params.scheduleId,
        fromStationId: query.fromStationId,
        toStationId: query.toStationId,
      },
      headers,
    );

    logger.debug(
      {
        module: "seat-map-service",
        scheduleId: params.scheduleId,
        status: grpcResponse.status,
      },
      "5. Validating and mapping gRPC response DTO",
    );
    this.validateGrpcResponseStatus(grpcResponse.status);

    const response = SeatMapMapper.toResponseDto(grpcResponse);
    await this.tryWriteCache(cacheKey, response);
    return response;
  }

  /**
   * Builds a deterministic SHA-1 cache key from the normalized query parameters.
   *
   * @param scheduleId - Schedule UUID string.
   * @param query - Validated seat-map query DTO containing fromStationId and toStationId.
   * @returns Cache key string formatted as `cache:seat-map:v1:<16-char-hash>`.
   */
  private buildCacheKey(scheduleId: string, query: SeatMapQueryDto): string {
    const normalized = [
      scheduleId.trim().toLowerCase(),
      query.fromStationId.trim().toLowerCase(),
      query.toStationId.trim().toLowerCase(),
    ].join("|");

    const hash = createHash("sha1")
      .update(normalized)
      .digest("hex")
      .slice(0, 16);
    return `${env.SEAT_MAP_CACHE_KEY_PREFIX}:v1:${hash}`;
  }

  /**
   * Performs an optional Elasticsearch pre-check for schedule existence.
   *
   * @remarks
   * A repository miss throws an HTTP 404 to spare calling the downstream gRPC service.
   * Non-ApiError repository errors (e.g. Elasticsearch connection issues) are logged as warnings and suppressed so execution falls back to gRPC.
   * @param scheduleId - Schedule UUID string to verify.
   * @throws {ApiError} (404) If schedule does not exist in Elasticsearch (`SCHEDULE_NOT_FOUND`).
   */
  private async precheckSchedule(scheduleId: string): Promise<void> {
    try {
      const exists =
        await this.trainSearchRepository.existsByScheduleId(scheduleId);
      if (!exists) {
        throw new ApiError(
          statusCode.notFound,
          ERROR_CODES.SCHEDULE_NOT_FOUND,
          `No schedule found for scheduleId=${scheduleId}.`,
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

  /**
   * Calls inventory-service `GetSeatMap` via gRPC and translates any low-level errors.
   *
   * @param request - gRPC request payload containing scheduleId, fromStationId, and toStationId.
   * @param headers - Optional HTTP headers to convert into safe gRPC metadata.
   * @returns Promise resolving to the raw {@link GrpcGetSeatMapResponse}.
   * @throws {ApiError} On gRPC client or transport error.
   */
  private async callInventoryGetSeatMap(
    request: GetSeatMapRequest,
    headers?: Record<string, string | undefined>,
  ): Promise<GrpcGetSeatMapResponse> {
    const metadata = headers ? createRpcMetadata(headers) : undefined;

    try {
      return await this.inventoryGrpcClient.getSeatMap(
        request,
        metadata ? { metadata } : undefined,
      );
    } catch (err) {
      throw this.translateGrpcError(err);
    }
  }

  /**
   * Validates the status discriminator returned from inventory-service gRPC call.
   *
   * @param status - Status string returned from gRPC.
   * @throws {ApiError} (404) If status is `SCHEDULE_NOT_FOUND`.
   * @throws {ApiError} (409) If status is `SCHEDULE_INACTIVE`.
   */
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

  /**
   * Translates gRPC client errors into standard API errors.
   *
   * @param err - Error thrown by gRPC client call.
   * @returns mapped to HTTP status code.
   */
  private translateGrpcError(err: unknown): ApiError {
    if (err instanceof ClientError) {
      logger.warn(
        { module: "seat-map-service", err },
        "inventory-service gRPC call failed",
      );
    }
    return mapGrpcClientErrorToApiError(
      err,
      "Seat map could not be retrieved. Please retry shortly.",
    );
  }

  /**
   * Reads and parses a cached seat-map response payload from Redis.
   *
   * @param key - Redis cache key string.
   * @returns Cached {@link SeatMapResponseDto} if found and parsed successfully; `null` on cache miss or deserialization error.
   */
  private async tryReadCache(key: string): Promise<SeatMapResponseDto | null> {
    try {
      const raw = await this.redis.get(key);
      if (!raw) return null;
      return JSON.parse(raw) as SeatMapResponseDto;
    } catch (err) {
      logger.warn(
        { module: "seat-map-service", err, cacheKey: key },
        "failed to read seat-map cache entry; falling through to gRPC",
      );
      return null;
    }
  }

  /**
   * Performs a best-effort write of the seat-map response payload to Redis with TTL.
   *
   * @param key - Redis cache key string.
   * @param value - {@link SeatMapResponseDto} payload to serialize and cache.
   * @returns Promise that resolves when cache write completes or degrades silently on error.
   */
  private async tryWriteCache(
    key: string,
    value: SeatMapResponseDto,
  ): Promise<void> {
    try {
      await this.redis.set(
        key,
        JSON.stringify(value),
        "EX",
        env.SEAT_MAP_CACHE_TTL_SECONDS,
      );
    } catch (err) {
      logger.warn(
        { module: "seat-map-service", err, cacheKey: key },
        "failed to write seat-map cache entry",
      );
    }
  }
}
