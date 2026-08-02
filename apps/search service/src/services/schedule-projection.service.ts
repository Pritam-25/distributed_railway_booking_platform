import type { IdempotencyRepository } from "@irctc/redis";
import { logger } from "@irctc/logger";
import type {
  ScheduleCreatedEventV1Type,
  ScheduleStatusChangedEventV1Type,
} from "@irctc/contracts";
import type { TrainSearchRepository } from "@repository";
import type {
  AvailableSeatsDto,
  CoachDocument,
  FareRangeDto,
  TrainScheduleDocument,
  TrainScheduleStopDocument,
} from "@dto";

/**
 * Discriminated union representing the outcome of a schedule projection event.
 */
export type ScheduleProjectionOutcome =
  | { kind: "APPLIED"; eventId: string; scheduleId: string }
  | { kind: "DEDUPED"; eventId: string; scheduleId: string }
  | { kind: "INVALID"; eventId?: string; reason: string };

/**
 * Per-train-category base price (INR per km) used as the projection-time
 * estimate for fare range. This is an approximation; live per-seat pricing
 * is sourced from inventory-service at booking time.
 *
 * Roughly mirrors inventory-service `PricingService.calculatePricePerKm`
 * shape — a small constant table is sufficient for the search card.
 */
const PRICE_PER_KM_BY_CATEGORY: Record<string, number> = {
  RAJDHANI: 1.7,
  SHATABDI: 1.6,
  VANDE_BHARAT: 1.8,
  DURONTO: 1.5,
  SUPERFAST: 1.2,
  PASSENGER: 0.5,
  EXPRESS: 0.9,
  DEMU: 0.45,
  MEMU: 0.45,
};

/**
 * ## ScheduleProjectionService
 *
 * Domain service managing the write-side schedule search projection in
 * Elasticsearch.
 *
 * @remarks
 * ### Responsibilities
 * - Translates parsed `ScheduleCreatedEventV1` and
 *   `ScheduleStatusChangedEventV1` Kafka events into Elasticsearch writes.
 * - Enforces two-phase Redis idempotency to prevent duplicate writes.
 * - Builds the precomputed `routesServed` flat-key set so the search
 *   query can filter both endpoint stations cheaply.
 *
 * ### Storage & Infrastructure
 * - **Elasticsearch**: `train_schedules` projection index.
 * - **Redis**: Two-phase idempotency reservation keys
 *   (`idempotency:<eventId>`).
 */
export class ScheduleProjectionService {
  /**
   * Creates an instance of ScheduleProjectionService.
   *
   * @param repository - Injected Elasticsearch schedule repository.
   * @param idempotency - Injected Redis idempotency repository.
   */
  constructor(
    private readonly repository: TrainSearchRepository,
    private readonly idempotency: IdempotencyRepository,
  ) {}

  /**
   * Projects a schedule-created event into the `train_schedules` index.
   *
   * @remarks
   * ### Side Effects
   * - **Elasticsearch**: Upserts document with `scheduleId` as `_id`,
   *   `refresh: "wait_for"`.
   * - **Redis**: Reserves and marks event ID as processed.
   *
   * ### Consistency Guarantees
   * - Event-ID replays return `DEDUPED` and skip Elasticsearch writes.
   * @param event - Parsed `ScheduleCreatedEventV1` payload.
   * @returns Projection outcome.
   */
  async applyCreated(
    event: ScheduleCreatedEventV1Type,
  ): Promise<ScheduleProjectionOutcome> {
    return this.dispatch(event.eventId, event.scheduleId, async () => {
      const doc = toDocument(event);
      await this.repository.upsert(doc);
    });
  }

  /**
   * Projects a schedule-status-changed event by partially updating
   * the matching document's `status`, `version`, and `updatedAt`.
   *
   * @remarks
   * ### Side Effects
   * - **Elasticsearch**: Partial `_update` on `train_schedules/<scheduleId>`.
   * - **Redis**: Reserves and marks event ID as processed.
   *
   * ### Failure Guarantees
   * - 404 from Elasticsearch is logged non-fatally: a status event
   *   arriving before the create event will be replayed by the next
   *   `SCHEDULE_CREATED` event.
   * @param event - Parsed `ScheduleStatusChangedEventV1` payload.
   * @returns Projection outcome.
   */
  async applyStatusChange(
    event: ScheduleStatusChangedEventV1Type,
  ): Promise<ScheduleProjectionOutcome> {
    return this.dispatch(event.eventId, event.scheduleId, async () => {
      const applied = await this.repository.updateStatus(
        event.scheduleId,
        event.status,
        event.version,
      );
      if (!applied) {
        logger.info(
          {
            module: "schedule-projection-service",
            scheduleId: event.scheduleId,
            eventId: event.eventId,
          },
          "schedule status update skipped: document not found yet",
        );
      }
    });
  }

  /**
   * Executes a projection action within a two-phase Redis idempotency lifecycle.
   *
   * @param eventId - Unique event UUID.
   * @param scheduleId - Target schedule UUID.
   * @param apply - Asynchronous callback executing the Elasticsearch write.
   * @returns Projection outcome (`APPLIED` or `DEDUPED`).
   */
  private async dispatch(
    eventId: string,
    scheduleId: string,
    apply: () => Promise<void>,
  ): Promise<ScheduleProjectionOutcome> {
    // 1. Reserve event ID in Redis (refuses duplicates)
    const reserved = await this.idempotency.reserveIfNew(eventId);
    if (!reserved) {
      logger.info(
        { module: "schedule-projection-service", scheduleId, eventId },
        "schedule event skipped: already processed or in-flight",
      );
      return { kind: "DEDUPED", eventId, scheduleId };
    }

    try {
      // 2. Apply projection write
      await apply();
      // 3. Mark event as processed
      await this.idempotency.markProcessed(eventId);
      return { kind: "APPLIED", eventId, scheduleId };
    } catch (err) {
      // 4. Release reservation on failure so retries can run
      await this.idempotency.release(eventId).catch((releaseErr) => {
        logger.warn(
          {
            module: "schedule-projection-service",
            scheduleId,
            eventId,
            err: releaseErr,
          },
          "failed to release idempotency reservation after projection error",
        );
      });
      throw err;
    }
  }
}

/**
 * Computes the per-seat-type `pricePerKm` for a coach by category.
 * Returns a sensible default for unknown categories.
 */
const pricePerKmForCategory = (category: string): number => {
  return PRICE_PER_KM_BY_CATEGORY[category] ?? 1.0;
};

/**
 * Flattens a parsed `ScheduleCreatedEventV1` event into the
 * `TrainScheduleDocument` shape stored in Elasticsearch.
 *
 * Side computations:
 * - `fromStationId` / `toStationId` are denormalized from first/last
 *   stops for cheap filtering.
 * - `routesServed` is the flat list of every (fromId, toId) pair the
 *   train serves (so a query for `A→C` matches `A→B→C` schedules).
 * - `fareRange` is min/max of `pricePerKm × totalDistance` across seats.
 * - `capacity` aggregates `totalSeats` per `coachType` and overall.
 */
const toDocument = (
  event: ScheduleCreatedEventV1Type,
): TrainScheduleDocument => {
  const sortedStops = [...event.stops].sort(
    (a, b) => a.stopNumber - b.stopNumber,
  );

  const stops: TrainScheduleStopDocument[] = sortedStops.map((stop) => ({
    stationId: stop.stationId,
    stationCode: stop.stationCode,
    stationName: stop.stationName,
    sequenceNumber: stop.stopNumber,
    arrivalMinutes: stop.arrivalMinutes ?? null,
    departureMinutes: stop.departureMinutes ?? null,
    distanceFromStart: stop.distanceFromStart,
  }));

  const firstStop = sortedStops[0];
  const lastStop = sortedStops[sortedStops.length - 1];

  // Build flat `routesServed` list: every (i, j) pair where i < j.
  const routesServed: string[] = [];
  for (let i = 0; i < sortedStops.length; i += 1) {
    const fromId = sortedStops[i]?.stationId;
    if (!fromId) continue;
    for (let j = i + 1; j < sortedStops.length; j += 1) {
      const toId = sortedStops[j]?.stationId;
      if (!toId) continue;
      routesServed.push(`${fromId}:${toId}`);
    }
  }

  // Build coach documents with per-coach pricing (the train category
  // drives pricePerKm in the MVP; per-coach pricing is layered later
  // when the booking-service owns the seat-level fare resolution).
  const basePricePerKm = pricePerKmForCategory(event.trainCategory);
  const coaches: CoachDocument[] = event.coaches.map((coach) => ({
    coachId: coach.coachId,
    coachNumber: coach.coachNumber,
    coachType: coach.coachType,
    totalSeats: coach.totalSeats,
    pricePerKm: basePricePerKm,
  }));

  // Compute fare range — min/max over coaches × totalDistance. We keep
  // pricing at the coach level here; live per-seat pricing is fetched
  // by the booking-service from inventory-service when needed.
  const totalDistance = lastStop?.distanceFromStart ?? 0;
  let minFare = Number.POSITIVE_INFINITY;
  let maxFare = 0;
  for (const coach of coaches) {
    const seatFare = coach.pricePerKm * totalDistance;
    if (seatFare < minFare) minFare = seatFare;
    if (seatFare > maxFare) maxFare = seatFare;
  }
  if (!Number.isFinite(minFare)) minFare = 0;
  const fareRange: FareRangeDto = {
    min: Math.round(minFare),
    max: Math.round(maxFare),
    currency: "INR",
  };

  // Capacity aggregates.
  const capacity: AvailableSeatsDto = {
    total: coaches.reduce((acc, c) => acc + c.totalSeats, 0),
    byCoachType: coaches.reduce<Record<string, number>>((acc, c) => {
      acc[c.coachType] = (acc[c.coachType] ?? 0) + c.totalSeats;
      return acc;
    }, {}),
  };

  // Format departureDate as YYYY-MM-DD for the ES `date` mapping.
  const departureDate =
    event.departureDate instanceof Date
      ? event.departureDate.toISOString().slice(0, 10)
      : new Date(event.departureDate).toISOString().slice(0, 10);

  const createdAt =
    event.createdAt instanceof Date
      ? event.createdAt.toISOString()
      : new Date(event.createdAt).toISOString();

  return {
    scheduleId: event.scheduleId,
    trainId: event.trainId,
    trainNumber: event.trainNumber,
    trainName: event.trainName,
    trainCategory: event.trainCategory,
    routeId: event.routeId,
    departureDate,
    status: event.status,
    version: event.version,
    operatingDays: [...event.operatingDays],
    fromStationId: firstStop?.stationId ?? "",
    toStationId: lastStop?.stationId ?? "",
    totalDistance,
    routesServed,
    stops,
    coaches,
    fareRange,
    capacity,
    createdAt,
    updatedAt: createdAt,
  } satisfies TrainScheduleDocument;
};
