import type { Client } from "@elastic/elasticsearch";
import { logger } from "@irctc/logger";
import { env } from "@config";
import type { TrainScheduleDocument } from "@dto";

/**
 * Combined query inputs for a `train_schedules` search.
 *
 * `fromStationId` and `toStationId` are pre-resolved by {@link TrainSearchService}
 * via the existing `stations` Elasticsearch index before this method is
 * called. `date` is a `YYYY-MM-DD` string.
 */
export interface TrainSearchInput {
  fromStationId: string;
  toStationId: string;
  date: string;
  category?: string;
  limit: number;
  offset: number;
}

/**
 * ## TrainSearchRepository
 *
 * Elasticsearch-backed repository for the schedule search read-model.
 *
 * @remarks
 * ### Responsibilities
 * - Manages the `train_schedules` index lifecycle (idempotent `ensureIndex`).
 * - Upserts schedule documents projected from `ScheduleCreatedEventV1`.
 * - Partially updates `status`/`version` on `ScheduleStatusChangedEventV1`.
 * - Executes the `fromStation/toStation/date` bool query that backs
 *   `GET /api/v1/search/trains`.
 *
 * ### Storage & Persistence
 * - **Elasticsearch**: Target index defined by `env.TRAIN_INDEX_NAME`.
 */
export class TrainSearchRepository {
  private readonly indexName: string;

  /**
   * Creates an instance of TrainSearchRepository.
   *
   * @param esClient - Configured Elasticsearch client instance.
   */
  constructor(private readonly esClient: Client) {
    this.indexName = env.TRAIN_INDEX_NAME;
  }

  /**
   * Ensures the `train_schedules` index exists with mappings for
   * schedule identity, departure date, status, and the nested `stops`
   * sub-document used to enforce `fromSeq < toSeq` ordering at query time.
   *
   * @remarks
   * ### Side Effects
   * - **Elasticsearch**: Optionally drops the index when
   *   `env.TRAIN_INDEX_RECREATE` is true; otherwise creates it on first boot.
   *
   * ### Consistency Guarantees
   * - Idempotent: skips index creation if it already exists.
   */
  async ensureIndex(): Promise<void> {
    // 1. Optionally drop the index for local sandbox testing
    if (env.TRAIN_INDEX_RECREATE) {
      const exists = await this.esClient.indices.exists({
        index: this.indexName,
      });
      if (exists) {
        logger.info(
          { module: "train-search-repository", index: this.indexName },
          "Dropping existing train_schedules index (TRAIN_INDEX_RECREATE=true)",
        );
        await this.esClient.indices.delete({ index: this.indexName });
      }
    }

    // 2. Skip work if the index is already in place
    const exists = await this.esClient.indices.exists({
      index: this.indexName,
    });
    if (exists) return;

    logger.info(
      { module: "train-search-repository", index: this.indexName },
      "Creating Elasticsearch train_schedules index",
    );

    // 3. Create the index with mappings — nested `stops` is the key for
    //    the from-station < to-station sequence-ordering filter at query time.
    await this.esClient.indices.create({
      index: this.indexName,
      settings: {
        number_of_shards: 1,
        number_of_replicas: 0,
      },
      mappings: {
        properties: {
          scheduleId: { type: "keyword" },
          trainId: { type: "keyword" },
          trainNumber: { type: "keyword" },
          trainName: {
            type: "text",
            fields: { keyword: { type: "keyword" } },
          },
          trainCategory: { type: "keyword" },
          routeId: { type: "keyword" },
          departureDate: { type: "date", format: "yyyy-MM-dd" },
          status: { type: "keyword" },
          version: { type: "long" },
          operatingDays: { type: "integer" },
          fromStationId: { type: "keyword" },
          toStationId: { type: "keyword" },
          totalDistance: { type: "integer" },
          routesServed: { type: "keyword" },
          stops: {
            type: "nested",
            properties: {
              stationId: { type: "keyword" },
              stationCode: { type: "keyword" },
              stationName: { type: "text" },
              sequenceNumber: { type: "integer" },
              arrivalMinutes: { type: "integer" },
              departureMinutes: { type: "integer" },
              distanceFromStart: { type: "integer" },
            },
          },
          coaches: {
            type: "nested",
            properties: {
              coachId: { type: "keyword" },
              coachNumber: { type: "keyword" },
              coachType: { type: "keyword" },
              totalSeats: { type: "integer" },
              pricePerKm: { type: "double" },
            },
          },
          fareRange: {
            properties: {
              min: { type: "double" },
              max: { type: "double" },
              currency: { type: "keyword" },
            },
          },
          capacity: {
            properties: {
              total: { type: "integer" },
              byCoachType: { type: "object", enabled: false },
            },
          },
          createdAt: { type: "date" },
          updatedAt: { type: "date" },
        },
      },
    });

    logger.info(
      { module: "train-search-repository", index: this.indexName },
      "Train schedules index created successfully.",
    );
  }

  /**
   * Upserts a schedule document into Elasticsearch using `scheduleId` as `_id`.
   *
   * @remarks
   * ### Side Effects
   * - **Elasticsearch**: Replaces or inserts a document in `train_schedules`
   *   with `refresh: "wait_for"` for read-your-write semantics.
   *
   * ### Consistency Guarantees
   * - `_id = scheduleId` ensures replays replace rather than duplicate records.
   * @param doc - Persisted schedule snapshot.
   */
  async upsert(doc: TrainScheduleDocument): Promise<void> {
    await this.esClient.index({
      index: this.indexName,
      id: doc.scheduleId,
      document: doc,
      refresh: "wait_for",
    });
  }

  /**
   * Updates the `status`, `version`, and `updatedAt` fields of a schedule document.
   *
   * Missing-document errors (HTTP 404) are caught and logged non-fatally to
   * tolerate out-of-order event delivery (e.g. a `ScheduleStatusChangedEventV1`
   * arriving before the `ScheduleCreatedEventV1` for the same schedule).
   *
   * @param scheduleId - Schedule UUID, also the document `_id`.
   * @param status - New lifecycle status.
   * @param version - New version number; writes are skipped if the stored
   *   document already has a strictly-greater version.
   * @returns `true` if the update was applied, `false` if skipped (stale or missing).
   */
  async updateStatus(
    scheduleId: string,
    status: TrainScheduleDocument["status"],
    version: number,
  ): Promise<boolean> {
    try {
      // 1. Use painless scripted update to guard against out-of-order events
      await this.esClient.update({
        index: this.indexName,
        id: scheduleId,
        script: {
          source:
            "if (ctx._source.version == null || ctx._source.version < params.version) " +
            "{ ctx._source.status = params.status; ctx._source.version = params.version; ctx._source.updatedAt = params.updatedAt; } " +
            "else { ctx.op = 'noop'; }",
          params: {
            status,
            version,
            updatedAt: new Date().toISOString(),
          },
        },
        refresh: "wait_for",
      });
      return true;
    } catch (err) {
      const statusCode = (err as { meta?: { statusCode?: number } })?.meta
        ?.statusCode;
      if (statusCode === 404) {
        logger.warn(
          { module: "train-search-repository", scheduleId },
          "Status update skipped: schedule document not found yet",
        );
        return false;
      }
      throw err;
    }
  }

  /**
   * Fetches a single schedule document by id.
   *
   * @param scheduleId - Schedule UUID.
   * @returns Document source, or `null` if missing.
   */
  async findScheduleById(
    scheduleId: string,
  ): Promise<TrainScheduleDocument | null> {
    try {
      const response = await this.esClient.get<TrainScheduleDocument>({
        index: this.indexName,
        id: scheduleId,
      });
      return response._source ?? null;
    } catch (err) {
      const statusCode = (err as { meta?: { statusCode?: number } })?.meta
        ?.statusCode;
      if (statusCode === 404) return null;
      throw err;
    }
  }

  /**
   * Executes the `fromStation → toStation on date` bool query against
   * the `train_schedules` index.
   *
   * The query filters on three coordinates:
   * 1. `routesServed` flat tag — both endpoint stations appear in this schedule.
   * 2. Nested `stops` clause — enforces `fromSequence < toSequence` ordering
   *    so `HWH → NDLS` doesn't match a `NDLS → HWH` schedule.
   * 3. `departureDate` exact-term + `status: ACTIVE`.
   *
   * @remarks
   * ### Side Effects
   * - **Elasticsearch**: Reads `train_schedules` index.
   * @param input - Pre-resolved station ids and search parameters.
   * @returns Page of schedule documents and total hit count.
   */
  async searchTrains(
    input: TrainSearchInput,
  ): Promise<{ count: number; schedules: TrainScheduleDocument[] }> {
    const filters: Record<string, unknown>[] = [
      { term: { departureDate: input.date } },
      { term: { status: "ACTIVE" } },
      { term: { routesServed: `${input.fromStationId}:${input.toStationId}` } },
    ];

    if (input.category) {
      filters.push({ term: { trainCategory: input.category } });
    }

    const response = await this.esClient.search<TrainScheduleDocument>({
      index: this.indexName,
      from: input.offset,
      size: input.limit,
      track_total_hits: true,
      query: {
        bool: {
          filter: filters,
          must: [
            {
              nested: {
                path: "stops",
                query: {
                  bool: {
                    filter: [
                      { term: { "stops.stationId": input.fromStationId } },
                    ],
                  },
                },
              },
            },
            {
              nested: {
                path: "stops",
                query: {
                  bool: {
                    filter: [
                      { term: { "stops.stationId": input.toStationId } },
                    ],
                  },
                },
              },
            },
          ],
        },
      },
      sort: [
        {
          "stops.sequenceNumber": {
            order: "asc",
            nested: { path: "stops" },
          },
        },
        { trainNumber: { order: "asc" } },
      ],
    });

    const schedules = response.hits.hits.flatMap((hit) => {
      if (!hit._source) return [];
      return [hit._source];
    });

    const totalRaw = response.hits.total;
    const count =
      typeof totalRaw === "number" ? totalRaw : (totalRaw?.value ?? 0);

    return { count, schedules };
  }
}
