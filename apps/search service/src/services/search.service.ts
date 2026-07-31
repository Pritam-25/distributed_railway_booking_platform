import type { Redis } from "@irctc/redis";
import { logger } from "@irctc/logger";
import { env } from "@config";
import type { StationSearchRepository } from "@repository";
import type { StationSuggestion, StationSuggestQueryDto } from "@dto";

/**
 * ## SearchService
 *
 * Domain service providing station autocomplete suggestions backed by Elasticsearch and Redis.
 *
 * @remarks
 * ### Responsibilities
 * - Serves station autocomplete queries with a Redis read-through caching layer.
 * - Manages cache key normalization and TTL expiration.
 * - Queries Elasticsearch station projection as the source of truth on cache misses.
 *
 * ### Storage & Persistence
 * - **Elasticsearch**: Source-of-truth `stations` index.
 * - **Redis**: Read-through suggestion cache with TTL.
 */
export class SearchService {
  /**
   * Creates an instance of SearchService.
   *
   * @param repository - Injected Elasticsearch station search repository.
   * @param redis - Injected Redis client.
   */
  constructor(
    private readonly repository: StationSearchRepository,
    private readonly redis: Redis,
  ) {}

  /**
   * Returns top-N station suggestions for an autocomplete query.
   *
   * @remarks
   * ### Responsibilities
   * - Normalizes query terms for deterministic cache key lookup.
   * - Attempts to read warm suggestion payload from Redis cache.
   * - Queries Elasticsearch station projection index on cache miss.
   * - Performs best-effort cache write of fresh results.
   *
   * ### Side Effects
   * - **Redis**: Reads and writes suggestion cache keys (`suggest:<q>:<limit>`).
   * - **Elasticsearch**: Executes completion query on `stations` index.
   *
   * ### Consistency Guarantees
   * - Key normalization converts `q` to lowercase so `"NDLS"` and `"ndls"` share a single cache entry.
   * - `limit` is embedded in the cache key so different limit values maintain separate result sets.
   *
   * ### Failure Guarantees
   * - Redis read and write errors are logged non-fatally and degrade gracefully to Elasticsearch.
   * - Elasticsearch network or cluster errors propagate to the caller untouched.
   * @param query - Validated search query DTO containing `q` search term and `limit`.
   * @returns Array of station suggestion objects matching the query.
   */
  async suggestStations(
    query: StationSuggestQueryDto,
  ): Promise<StationSuggestion[]> {
    // 1. Check Redis suggestion cache for warm result
    const cacheKey = this.buildCacheKey(query);
    const cached = await this.tryReadCache(cacheKey);
    if (cached) return cached;

    // 2. Query Elasticsearch source-of-truth index on cache miss
    const fresh = await this.repository.suggest(query.q, query.limit);

    // 3. Perform best-effort cache write for fresh search result (non-blocking)
    await this.tryWriteCache(cacheKey, fresh);

    return fresh;
  }

  /**
   * Generates a deterministic lowercase cache key for a suggest query.
   *
   * @param query - Validated query DTO carrying `q` and `limit`.
   * @returns Formatted cache key string (`suggest:<q>:<limit>`).
   */
  private buildCacheKey(query: StationSuggestQueryDto): string {
    return `${env.SUGGEST_CACHE_KEY_PREFIX}:${query.q.toLowerCase()}:${query.limit}`;
  }

  /**
   * Attempts to read and parse a cached suggestion array from Redis.
   *
   * @param key - Redis cache key string.
   * @returns Array of station suggestions if cache hit, null on miss or error.
   */
  private async tryReadCache(key: string): Promise<StationSuggestion[] | null> {
    try {
      const raw = await this.redis.get(key);
      if (!raw) return null;
      return JSON.parse(raw) as StationSuggestion[];
    } catch (err) {
      logger.warn(
        { module: "search-service", err, cacheKey: key },
        "failed to read suggestion cache entry; falling through to Elasticsearch",
      );
      return null;
    }
  }

  /**
   * Attempts to store a fresh suggestion array in Redis with TTL.
   *
   * @param key - Redis cache key string.
   * @param value - Station suggestions array to cache.
   */
  private async tryWriteCache(
    key: string,
    value: StationSuggestion[],
  ): Promise<void> {
    try {
      await this.redis.set(
        key,
        JSON.stringify(value),
        "EX",
        env.SUGGEST_CACHE_TTL_SECONDS,
      );
    } catch (err) {
      logger.warn(
        { module: "search-service", err, cacheKey: key },
        "failed to write suggestion cache entry",
      );
    }
  }
}
