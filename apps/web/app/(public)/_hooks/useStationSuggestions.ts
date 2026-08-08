"use client"

import { useQuery } from "@tanstack/react-query"

import { useDebouncedValue } from "@/hooks/useDebouncedValue"
import { suggestStations } from "@/generated/endpoints/search/search"

import { searchKeys } from "./keys"

/**
 * ## useStationSuggestions
 *
 * Debounced station-autocomplete query. Wraps the orval-generated
 * `suggestStations` function inside a `useQuery` so the result is
 * cached, deduped, and cancellable.
 *
 * The query is **disabled** until the trimmed query is at least
 * 2 characters long — mirroring the backend Zod validator.
 *
 * `staleTime` is set to 60 seconds; the same query that's been typed
 * once stays warm through subsequent re-renders without refetching.
 *
 * @param q - The live text from the user (untrimmed).
 * @param limit - Max suggestions to return. Defaults to 8.
 * @returns The standard `useQuery` result. The shape of `data.data` is
 *   `{ count: number, stations: StationSuggestion[] }` (envelope
 *   unwrapped from the API response).
 */
export function useStationSuggestions(q: string, limit: number = 8) {
  const debouncedQ = useDebouncedValue(q, 300)
  const trimmed = debouncedQ.trim()

  return useQuery({
    queryKey: searchKeys.suggest(trimmed, limit),
    queryFn: ({ signal }) => suggestStations({ q: trimmed, limit }, { signal }),
    enabled: trimmed.length >= 2,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  })
}
