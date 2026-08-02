import { createHash } from "node:crypto";
import type { Redis } from "@irctc/redis";
import { logger } from "@irctc/logger";
import { ApiError, COMMON_ERROR_CODES } from "@irctc/errors";
import { statusCode } from "@irctc/http";
import { env } from "@config";
import type {
  StationSearchRepository,
  TrainSearchRepository,
} from "@repository";
import {
  type TrainSearchQueryDto,
  type TrainSearchResponseDto,
  type TrainSearchResultDto,
  type StationSuggestion,
  type TrainScheduleDocument,
  dayOfWeekLabel,
} from "@dto";
import { ERROR_CODES } from "@utils/errors";

/**
 * ## TrainSearchService
 *
 * Domain service powering `GET /api/v1/search/trains`.
 *
 * @remarks
 * ### Responsibilities
 * - Resolves `(fromStation, toStation)` strings to canonical station IDs
 *   via the existing `stations` Elasticsearch index.
 * - Builds the Elasticsearch query against `train_schedules` for the
 *   page and filter parameters.
 * - Maps raw schedule documents into the public DTO shape returned by
 *   the controller.
 * - Manages Redis cache-aside reads and best-effort writes.
 *
 * ### Storage & Persistence
 * - **Elasticsearch**: Source-of-truth `train_schedules` index plus the
 *   `stations` index for station-code resolution.
 * - **Redis**: Read-through result cache (`cache:train-search:v1:<hash>`).
 */
export class TrainSearchService {
  /**
   * Creates an instance of TrainSearchService.
   *
   * @param trainRepository - Injected Elasticsearch schedule repository.
   * @param stationRepository - Injected Elasticsearch station repository.
   * @param redis - Injected Redis client for cache-aside.
   */
  constructor(
    private readonly trainRepository: TrainSearchRepository,
    private readonly stationRepository: StationSearchRepository,
    private readonly redis: Redis,
  ) {}

  /**
   * Runs a full train search: resolves stations, queries Elasticsearch,
   * and returns the response DTO ready for the controller envelope.
   *
   * @remarks
   * ### Side Effects
   * - **Redis**: Reads and writes the `cache:train-search:v1:*` cache.
   * - **Elasticsearch**: Two reads — station suggestion lookup and
   *   schedule `searchTrains`.
   *
   * ### Failure Guarantees
   * - Cache failures degrade gracefully to direct Elasticsearch reads.
   * - Station-not-found errors throw `STATION_NOT_FOUND` early so the
   *   route layer can return a 404 with the offending station name.
   * @param query - Validated {@link TrainSearchQueryDto}.
   * @returns Train search response payload.
   */
  async searchTrains(
    query: TrainSearchQueryDto,
  ): Promise<TrainSearchResponseDto> {
    // 1. Try cache first
    const cacheKey = this.buildCacheKey(query);
    const cached = await this.tryReadCache(cacheKey);
    if (cached) return cached;

    // 2. Resolve from/to stations to canonical UUIDs (codes are uppercase; UUIDs pass through)
    const fromStation = await this.resolveStation(
      query.fromStation,
      "fromStation",
    );
    const toStation = await this.resolveStation(query.toStation, "toStation");

    if (fromStation.stationId === toStation.stationId) {
      throw new ApiError(
        statusCode.badRequest,
        COMMON_ERROR_CODES.INVALID_INPUT,
        "fromStation and toStation must be different.",
      );
    }

    // 3. Query the schedules index
    const { count, schedules } = await this.trainRepository.searchTrains({
      fromStationId: fromStation.stationId,
      toStationId: toStation.stationId,
      date: query.date,
      ...(query.category !== undefined ? { category: query.category } : {}),
      limit: query.limit,
      offset: query.offset,
    });

    // 4. Map documents into the response DTO
    const response: TrainSearchResponseDto = {
      fromStation: {
        stationId: fromStation.stationId,
        code: fromStation.code,
        name: fromStation.name,
      },
      toStation: {
        stationId: toStation.stationId,
        code: toStation.code,
        name: toStation.name,
      },
      date: query.date,
      count,
      trains: schedules.map((doc) =>
        this.toResultDto(doc, fromStation, toStation),
      ),
    };

    // 5. Best-effort cache write
    await this.tryWriteCache(cacheKey, response);

    return response;
  }

  /**
   * Builds a deterministic SHA-1 cache key from the normalized query.
   * Codes are uppercased, category lowercased, date preserved verbatim.
   *
   * @param query - Validated train-search query DTO.
   * @returns Cache key string.
   */
  private buildCacheKey(query: TrainSearchQueryDto): string {
    const normalized = [
      query.fromStation.trim().toUpperCase(),
      query.toStation.trim().toUpperCase(),
      query.date,
      query.category?.toLowerCase() ?? "any",
      String(query.limit),
      String(query.offset),
    ].join("|");

    const hash = createHash("sha1")
      .update(normalized)
      .digest("hex")
      .slice(0, 16);
    return `${env.TRAIN_SEARCH_CACHE_KEY_PREFIX}:v1:${hash}`;
  }

  /**
   * Resolves a user-entered station identifier to a canonical station record.
   * Accepts either an uppercase station code (e.g. `NDLS`) or a UUID.
   *
   * @param value - Raw `fromStation` or `toStation` value.
   * @param fieldName - Field name used for error messages.
   * @returns Canonical station suggestion.
   * @throws {ApiError} `STATION_NOT_FOUND` if no active station matches.
   */
  private async resolveStation(
    value: string,
    fieldName: string,
  ): Promise<StationSuggestion> {
    const trimmed = value.trim();

    // 1. UUID path — verify it exists in the stations index
    if (isUuid(trimmed)) {
      const matches = await this.stationRepository.suggest(trimmed, 1);
      const hit = matches.find((s) => s.stationId === trimmed);
      if (hit?.isActive) return hit;
      throw new ApiError(
        statusCode.notFound,
        ERROR_CODES.STATION_NOT_FOUND,
        `${fieldName} could not be resolved.`,
      );
    }

    // 2. Code path — case-insensitive suggestion lookup
    const suggestions = await this.stationRepository.suggest(trimmed, 1);
    const codeMatch = suggestions.find(
      (s) => s.code.toLowerCase() === trimmed.toLowerCase() && s.isActive,
    );
    if (codeMatch) return codeMatch;

    throw new ApiError(
      statusCode.notFound,
      ERROR_CODES.STATION_NOT_FOUND,
      `${fieldName} could not be resolved.`,
    );
  }

  /**
   * Maps a stored `TrainScheduleDocument` into the public result DTO shape.
   * Looks up the user's from/to stations inside `stops[]` to extract
   * per-stop timing and distance for the response.
   *
   * @param doc - Persisted schedule document.
   * @param fromStation - Resolved from-station (for code/name display).
   * @param toStation - Resolved to-station (for code/name display).
   * @returns Result DTO row.
   */
  private toResultDto(
    doc: TrainScheduleDocument,
    fromStation: StationSuggestion,
    toStation: StationSuggestion,
  ): TrainSearchResultDto {
    const sortedStops = [...doc.stops].sort(
      (a, b) => a.sequenceNumber - b.sequenceNumber,
    );

    const fromStop = sortedStops.find(
      (s) => s.stationId === fromStation.stationId,
    );
    const toStop = sortedStops.find((s) => s.stationId === toStation.stationId);

    const distanceKm =
      fromStop && toStop
        ? Math.max(0, toStop.distanceFromStart - fromStop.distanceFromStart)
        : doc.totalDistance;

    const durationMinutes =
      fromStop?.departureMinutes != null && toStop?.arrivalMinutes != null
        ? Math.max(0, toStop.arrivalMinutes - fromStop.departureMinutes)
        : null;

    return {
      scheduleId: doc.scheduleId,
      trainId: doc.trainId,
      trainNumber: doc.trainNumber,
      trainName: doc.trainName,
      category: doc.trainCategory,
      from: {
        stationId: fromStation.stationId,
        code: fromStation.code,
        name: fromStation.name,
        departureTime:
          fromStop?.departureMinutes != null
            ? minutesToIsoTime(doc.departureDate, fromStop.departureMinutes)
            : null,
        platform: null,
      },
      to: {
        stationId: toStation.stationId,
        code: toStation.code,
        name: toStation.name,
        arrivalTime:
          toStop?.arrivalMinutes != null
            ? minutesToIsoTime(doc.departureDate, toStop.arrivalMinutes)
            : null,
        platform: null,
      },
      durationMinutes,
      distanceKm,
      fareRange: doc.fareRange,
      availableSeats: doc.capacity,
      status: doc.status,
      operatingDays: doc.operatingDays.map((d) => dayOfWeekLabel[d] ?? "?"),
    };
  }

  /**
   * Reads and parses a cached response payload. Returns null on miss or error.
   *
   * @param key - Cache key.
   * @returns Cached response or null.
   */
  private async tryReadCache(
    key: string,
  ): Promise<TrainSearchResponseDto | null> {
    try {
      const raw = await this.redis.get(key);
      if (!raw) return null;
      return JSON.parse(raw) as TrainSearchResponseDto;
    } catch (err) {
      logger.warn(
        { module: "train-search-service", err, cacheKey: key },
        "failed to read train-search cache entry; falling through to Elasticsearch",
      );
      return null;
    }
  }

  /**
   * Best-effort write of the response payload with TTL.
   *
   * @param key - Cache key.
   * @param value - Response payload.
   */
  private async tryWriteCache(
    key: string,
    value: TrainSearchResponseDto,
  ): Promise<void> {
    try {
      await this.redis.set(
        key,
        JSON.stringify(value),
        "EX",
        env.TRAIN_SEARCH_CACHE_TTL_SECONDS,
      );
    } catch (err) {
      logger.warn(
        { module: "train-search-service", err, cacheKey: key },
        "failed to write train-search cache entry",
      );
    }
  }
}

/**
 * Cheap UUID detector; we only need to know "does this look like a UUID?"
 * for routing to the index lookup vs. the code-suggest lookup. Final
 * validity is enforced by the ES query.
 */
const isUuid = (value: string): boolean => {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
};

/**
 * Combines a `YYYY-MM-DD` date with a minutes-from-midnight value into
 * an ISO timestamp in the local timezone of the running process.
 */
const minutesToIsoTime = (date: string, minutes: number): string | null => {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return null;
  const d = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  d.setUTCMinutes(d.getUTCMinutes() + minutes);
  return d.toISOString();
};
