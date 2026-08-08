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
  limit: number; // <--- number of records to return
  offset: number; // <--- number of records to skip
}

/**
 * Discriminated union representing the result of a status update attempt.
 */
export type UpdateStatusResult =
  { applied: true } | { applied: false; reason: "NOT_FOUND" | "STALE" };

/**
 * ## TrainSearchRepository
 *
 * Data access repository managing train schedule search index operations in Elasticsearch.
 *
 * @remarks
 * ### Responsibilities
 * - Manages index creation with custom analyzers and mappings for `train_schedules`.
 * - Handles document upserts and partial status updates for schedule read projections.
 * - Executes nested station filtering and fare range queries for train search.
 *
 * ### Storage & Persistence
 * - **Elasticsearch**: Target index defined by `env.TRAIN_SCHEDULE_INDEX_NAME`.
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
   * Ensures the `train_schedules` index exists with custom mappings and analyzers.
   *
   * @remarks
   * ### Responsibilities
   * - Checks index existence in Elasticsearch.
   * - Creates index with settings and field mappings if missing.
   * - Optionally drops existing index when `env.TRAIN_INDEX_RECREATE` is true (local testing).
   *
   * ### Side Effects
   * - **Elasticsearch**: Creates or drops `train_schedules` index.
   *
   * ### Consistency Guarantees
   * - Idempotent operation: skips index creation if index already exists.
   */
  async ensureIndex(): Promise<void> {
    // 1. Optionally drop index if TRAIN_INDEX_RECREATE is enabled for sandbox testing
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

    // 2. Verify if train_schedules index already exists in Elasticsearch
    const exists = await this.esClient.indices.exists({
      index: this.indexName,
    });
    if (exists) return;

    logger.info(
      { module: "train-search-repository", index: this.indexName },
      "Creating Elasticsearch train_schedules index",
    );

    // 3. Create train_schedules index with custom mappings
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
          trainName: { type: "text" },
          trainCategory: { type: "keyword" },
          routeId: { type: "keyword" },
          departureDate: { type: "date" },
          status: { type: "keyword" },
          version: { type: "integer" },
          operatingDays: { type: "keyword" },
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
              pricePerKm: { type: "float" },
            },
          },
          fareRange: {
            properties: {
              min: { type: "integer" },
              max: { type: "integer" },
              currency: { type: "keyword" },
            },
          },
          capacity: {
            properties: {
              total: { type: "integer" },
              byCoachType: { type: "object", enabled: true },
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
   * Upserts a schedule document into Elasticsearch using scripted update
   * with a version guard to prevent redelivered create events from overwriting
   * newer status projections.
   *
   * @param doc - Persisted schedule snapshot.
   */
  async upsert(doc: TrainScheduleDocument): Promise<void> {
    await this.esClient.update({
      index: this.indexName,
      id: doc.scheduleId,
      script: {
        source:
          "if (ctx._source.version == null || ctx._source.version <= params.doc.version) " +
          "{ ctx._source = params.doc; } else { ctx.op = 'noop'; }",
        params: { doc },
      },
      upsert: doc,
      refresh: "wait_for",
    });
  }

  /**
   * Updates the `status`, `version`, and `updatedAt` fields of a schedule document.
   *
   * @param scheduleId - Schedule UUID, also the document `_id`.
   * @param status - New lifecycle status.
   * @param version - New version number; writes are skipped if the stored
   *   document already has a strictly-greater version.
   * @returns Detailed result object indicating whether applied or skipped (NOT_FOUND / STALE).
   */
  async updateStatus(
    scheduleId: string,
    status: TrainScheduleDocument["status"],
    version: number,
  ): Promise<UpdateStatusResult> {
    try {
      // 1. Use painless scripted update to guard against out-of-order events
      const response = await this.esClient.update({
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

      if (response.result === "noop") {
        return { applied: false, reason: "STALE" };
      }

      return { applied: true };
    } catch (err) {
      const statusCode = (err as { meta?: { statusCode?: number } })?.meta
        ?.statusCode;
      if (statusCode === 404) {
        logger.warn(
          { module: "train-search-repository", scheduleId },
          "Status update skipped: schedule document not found yet",
        );
        return { applied: false, reason: "NOT_FOUND" };
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
          "stops.departureMinutes": {
            order: "asc",
            nested: {
              path: "stops",
              filter: { term: { "stops.stationId": input.fromStationId } },
            },
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
