import type { SearchTrainsParams } from "@/generated/model/searchTrainsParams"

/**
 * ## searchKeys
 *
 * Centralised React Query key factory for the search feature. Use these
 * for invalidation and dedupe; the typed helpers guarantee that hook
 * call-sites share the same key shape as other consumers.
 */
export const searchKeys = {
  all: ["search"] as const,

  /**
   * Query key for the station-autocomplete results. Keyed by
   * `(q, limit)` so different queries don't collide.
   */
  suggest: (q: string, limit: number) =>
    [...searchKeys.all, "suggest", q, limit] as const,

  /**
   * Query key for a train-search invocation. Serialised via
   * `JSON.stringify` to keep the comparator stable across object
   * identity variations (the orval SDK sometimes reuses literal
   * objects).
   */
  trains: (params: SearchTrainsParams) =>
    [...searchKeys.all, "trains", JSON.stringify(params)] as const,
}
