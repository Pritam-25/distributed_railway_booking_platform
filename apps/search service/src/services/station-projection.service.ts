import type { IdempotencyRepository } from "@irctc/redis";
import { logger } from "@irctc/logger";
import type {
  StationCreatedEventV1Type,
  StationUpdatedEventV1Type,
  StationDeactivatedEventV1Type,
} from "@irctc/contracts";
import type { StationSearchRepository, StationDocument } from "@repository";

/**
 * Discriminated union representing the outcome of a station projection event.
 */
export type StationProjectionOutcome =
  | { kind: "APPLIED"; eventId: string; stationId: string }
  | { kind: "DEDUPED"; eventId: string; stationId: string }
  | { kind: "INVALID"; eventId?: string; reason: string };

/**
 * ## StationProjectionService
 *
 * Domain service managing the write-side station search projection in Elasticsearch.
 *
 * @remarks
 * ### Responsibilities
 * - Translates parsed Kafka domain events into Elasticsearch station document writes.
 * - Enforces two-phase Redis idempotency to prevent duplicate write processing.
 * - Handles station creation, updates, and deactivations.
 *
 * ### Storage & Persistence
 * - **Elasticsearch**: `stations` search index.
 * - **Redis**: Two-phase idempotency reservation keys (`idempotency:<eventId>`).
 */
export class StationProjectionService {
  /**
   * Creates an instance of StationProjectionService.
   *
   * @param repository - Injected Elasticsearch station projection repository.
   * @param idempotency - Injected Redis idempotency repository.
   */
  constructor(
    private readonly repository: StationSearchRepository,
    private readonly idempotency: IdempotencyRepository,
  ) {}

  /**
   * Projects a created or updated station domain event into Elasticsearch.
   *
   * @remarks
   * ### Responsibilities
   * - Flattens station creation or update event payload into a {@link StationDocument}.
   * - Dispatches upsert to Elasticsearch via two-phase idempotency workflow.
   *
   * ### Side Effects
   * - **Elasticsearch**: Upserts document in `stations` index with `refresh: "wait_for"`.
   * - **Redis**: Reserves and marks event ID as processed.
   *
   * ### Consistency Guarantees
   * - Both created and updated events carry post-write records, ensuring upsert idempotency.
   * - Event ID replays return `DEDUPED` and skip Elasticsearch writes.
   * @param event - Parsed station created or updated event payload.
   * @returns Projection outcome (`APPLIED`, `DEDUPED`, or `INVALID`).
   */
  async applyUpsert(
    event: StationCreatedEventV1Type | StationUpdatedEventV1Type,
  ): Promise<StationProjectionOutcome> {
    return this.dispatch(event.eventId, event.stationId, () => {
      const doc = toDocument(event);
      return this.repository.upsert(doc);
    });
  }

  /**
   * Projects a station deactivation event into Elasticsearch.
   *
   * @remarks
   * ### Responsibilities
   * - Performs partial update flipping `isActive` to `false` on the target station document.
   * - Dispatches update via two-phase idempotency workflow.
   *
   * ### Side Effects
   * - **Elasticsearch**: Updates `isActive` field on target station document.
   * - **Redis**: Reserves and marks event ID as processed.
   *
   * ### Consistency Guarantees
   * - Missing document errors (404) in Elasticsearch are converted to no-ops to tolerate out-of-order event delivery.
   * @param event - Parsed station deactivated event payload.
   * @returns Projection outcome (`APPLIED`, `DEDUPED`, or `INVALID`).
   */
  async applyDeactivated(
    event: StationDeactivatedEventV1Type,
  ): Promise<StationProjectionOutcome> {
    return this.dispatch(event.eventId, event.stationId, () => {
      return this.repository.updateActiveStatus(event.stationId, false);
    });
  }

  /**
   * Executes a projection action within a two-phase Redis idempotency lifecycle.
   *
   * @remarks
   * ### Responsibilities
   * - Reserves event ID in Redis before executing projection logic.
   * - Marks event ID as `PROCESSED` on successful execution.
   * - Releases reservation on failure so subsequent event replays can retry immediately.
   *
   * ### Side Effects
   * - **Redis**: Mutates idempotency reservation key state.
   *
   * ### Failure Guarantees
   * - Failure to release an idempotency reservation is logged non-fatally; reservation expires automatically on TTL.
   * @param eventId - Unique event UUID.
   * @param stationId - Target station UUID.
   * @param apply - Asynchronous callback executing the Elasticsearch projection write.
   * @returns Projection outcome indicating whether the event was applied or deduped.
   */
  private async dispatch(
    eventId: string,
    stationId: string,
    apply: () => Promise<void>,
  ): Promise<StationProjectionOutcome> {
    // 1. Reserve event ID in Redis to prevent concurrent processing
    const reserved = await this.idempotency.reserveIfNew(eventId);
    if (!reserved) {
      logger.info(
        { module: "station-projection-service", stationId, eventId },
        "station event skipped: already processed or in-flight",
      );
      return { kind: "DEDUPED", eventId, stationId };
    }

    try {
      // 2. Execute Elasticsearch projection write
      await apply();
      // 3. Mark event ID as PROCESSED in Redis
      await this.idempotency.markProcessed(eventId);
      return { kind: "APPLIED", eventId, stationId };
    } catch (err) {
      // 4. Release Redis reservation on failure so subsequent replays can retry immediately
      await this.idempotency.release(eventId).catch((releaseErr) => {
        logger.warn(
          {
            module: "station-projection-service",
            stationId,
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
 * Flattens a created or updated station event into the Elasticsearch document schema.
 *
 * @param event - Station created or updated event payload.
 * @returns Formatted station document.
 */
const toDocument = (
  event: StationCreatedEventV1Type | StationUpdatedEventV1Type,
): StationDocument => {
  const suggest = [
    event.stationName,
    event.stationCode,
    event.zone,
    event.state,
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase());

  return {
    stationId: event.stationId,
    code: event.stationCode,
    name: event.stationName,
    zone: event.zone ?? null,
    state: event.state ?? null,
    isActive: event.isActive,
    suggest,
  } satisfies StationDocument;
};
