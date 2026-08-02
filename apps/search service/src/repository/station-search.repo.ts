import type { Client } from "@elastic/elasticsearch";
import { logger } from "@irctc/logger";
import { env } from "@config";
import type { StationSuggestion } from "@dto";

/**
 * Structure of a station document stored in Elasticsearch `stations` index.
 */
export interface StationDocument {
  stationId: string;
  code: string;
  name: string;
  zone: string | null;
  state: string | null;
  isActive: boolean;
  suggest: string[];
}

/**
 * ## StationSearchRepository
 *
 * Data access repository managing station search index operations in Elasticsearch.
 *
 * @remarks
 * ### Responsibilities
 * - Manages index creation with custom edge-ngram autocomplete analyzers.
 * - Handles document upserts and active status updates for the read projection.
 * - Executes boosted multi-match completion queries for station autocomplete.
 *
 * ### Storage & Persistence
 * - **Elasticsearch**: Target index defined by `env.STATION_INDEX_NAME`.
 */
export class StationSearchRepository {
  // Configurable via env so tests can sandbox.
  private readonly indexName: string;

  /**
   * Creates an instance of StationSearchRepository.
   *
   * @param esClient - Configured Elasticsearch client instance.
   */
  constructor(private readonly esClient: Client) {
    this.indexName = env.STATION_INDEX_NAME;
  }

  /**
   * Ensures the `stations` index exists with custom autocomplete edge-ngram analyzers.
   *
   * @remarks
   * ### Responsibilities
   * - Checks index existence in Elasticsearch.
   * - Creates index with edge-ngram tokenizers and field mappings if missing.
   * - Optionally drops existing index when `env.STATION_INDEX_RECREATE` is true (local testing).
   *
   * ### Side Effects
   * - **Elasticsearch**: Creates or drops `stations` index.
   *
   * ### Consistency Guarantees
   * - Idempotent operation: skips index creation if index already exists.
   */
  async ensureIndex(): Promise<void> {
    // 1. Optionally drop index if STATION_INDEX_RECREATE is enabled for sandbox testing
    if (env.STATION_INDEX_RECREATE) {
      const exists = await this.esClient.indices.exists({
        index: this.indexName,
      });
      if (exists) {
        logger.info(
          { module: "station-search-repository", index: this.indexName },
          "Dropping existing stations index (STATION_INDEX_RECREATE=true)",
        );
        await this.esClient.indices.delete({ index: this.indexName });
      }
    }

    // 2. Verify if stations index already exists in Elasticsearch
    const exists = await this.esClient.indices.exists({
      index: this.indexName,
    });
    if (exists) return;

    logger.info(
      { module: "station-search-repository", index: this.indexName },
      "Creating Elasticsearch stations index",
    );

    // 3. Create stations index with custom edge-ngram autocomplete analyzer and mappings
    await this.esClient.indices.create({
      index: this.indexName,
      settings: {
        number_of_shards: 1,
        number_of_replicas: 0,
        analysis: {
          analyzer: {
            autocomplete_index_analyzer: {
              type: "custom",
              tokenizer: "autocomplete_tokenizer",
              filter: ["lowercase"],
            },
            search_analyzer: {
              type: "custom",
              tokenizer: "standard",
              filter: ["lowercase"],
            },
          },
          tokenizer: {
            autocomplete_tokenizer: {
              type: "edge_ngram",
              min_gram: 2,
              max_gram: 20,
              token_chars: ["letter", "digit"],
            },
          },
        },
      },
      mappings: {
        properties: {
          stationId: { type: "keyword" },
          code: {
            type: "text",
            analyzer: "autocomplete_index_analyzer",
            search_analyzer: "search_analyzer",
          },
          name: {
            type: "text",
            analyzer: "autocomplete_index_analyzer",
            search_analyzer: "search_analyzer",
          },
          zone: { type: "keyword" },
          state: { type: "keyword" },
          isActive: { type: "boolean" },
          suggest: { type: "keyword" },
        },
      },
    });

    logger.info(
      { module: "station-search-repository", index: this.indexName },
      "Stations index created successfully.",
    );
  }

  /**
   * Upserts a station document into Elasticsearch using `stationId` as `_id`.
   *
   * @remarks
   * ### Responsibilities
   * - Indexes station document using `stationId` as explicit Elasticsearch document ID.
   * - Forces immediate searchability using `refresh: "wait_for"`.
   *
   * ### Side Effects
   * - **Elasticsearch**: Replaces or inserts document in `stations` index.
   *
   * ### Consistency Guarantees
   * - Uses explicit document `_id` binding to ensure idempotent replays replace rather than duplicate records.
   * @param doc - Station document payload to index.
   */
  async upsert(doc: StationDocument): Promise<void> {
    // 1. Index station document using stationId as Elasticsearch document ID
    await this.esClient.index({
      index: this.indexName,
      id: doc.stationId,
      document: doc,
      refresh: "wait_for",
    });
  }

  /**
   * Updates the `isActive` status flag of a station document.
   *
   * @remarks
   * ### Responsibilities
   * - Performs partial document update to modify station active status.
   *
   * ### Side Effects
   * - **Elasticsearch**: Mutates `isActive` field on target document.
   *
   * ### Consistency Guarantees
   * - Missing document errors (HTTP 404) are caught and logged non-fatally to handle out-of-order event arrivals safely.
   * @param stationId - Unique station identifier.
   * @param isActive - New active status boolean flag.
   */
  async updateActiveStatus(
    stationId: string,
    isActive: boolean,
  ): Promise<void> {
    try {
      // 1. Issue partial update for isActive property on target document
      await this.esClient.update({
        index: this.indexName,
        id: stationId,
        doc: { isActive },
        refresh: "wait_for",
      });
    } catch (err) {
      // 2. Catch 404 missing document response and log non-fatally
      const status = (err as { meta?: { statusCode?: number } })?.meta
        ?.statusCode;
      if (status === 404) {
        logger.warn(
          { module: "station-search-repository", stationId },
          "Active-status update skipped: station document not found yet",
        );
        return;
      }
      throw err;
    }
  }

  /**
   * Executes a boosted autocomplete query against active stations in Elasticsearch.
   *
   * @remarks
   * ### Responsibilities
   * - Builds bool query filtering `isActive: true` and matching `code` (boost 3x) and `name` (boost 1x / 0.5x fuzzy).
   * - Excludes `suggest` internal index field from response payload.
   * - Maps hit sources to {@link StationSuggestion} DTO array.
   *
   * ### Side Effects
   * - **Elasticsearch**: Reads `stations` index.
   * @param query - Search term query string.
   * @param limit - Maximum number of suggestions to return.
   * @returns Array of station suggestions sorted by Elasticsearch relevance score.
   */
  async suggest(query: string, limit: number): Promise<StationSuggestion[]> {
    // 1. Execute boosted multi-match boolean search query on Elasticsearch stations index
    const response = await this.esClient.search<StationDocument>({
      index: this.indexName,
      size: limit,
      _source_excludes: ["suggest"],
      query: {
        bool: {
          filter: [{ term: { isActive: true } }],
          should: [
            { match: { code: { query, boost: 3 } } },
            { match: { name: { query, boost: 1 } } },
            {
              match: {
                name: { query, fuzziness: "AUTO", boost: 0.5 },
              },
            },
          ],
          minimum_should_match: 1,
        },
      },
    });

    // 2. Map Elasticsearch hits to StationSuggestion DTO array
    return response.hits.hits.flatMap((hit) => {
      if (!hit._source) return [];
      return [
        {
          stationId: hit._source.stationId,
          code: hit._source.code,
          name: hit._source.name,
          zone: hit._source.zone,
          state: hit._source.state,
          isActive: hit._source.isActive,
        } satisfies StationSuggestion,
      ];
    });
  }
}
