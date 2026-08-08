"use client"

import { useQuery } from "@tanstack/react-query"

import { searchTrains } from "@/generated/endpoints/search/search"
import type { SearchTrainsParams } from "@/generated/model/searchTrainsParams"

import { searchKeys } from "./keys"

/**
 * ## useSearchTrains
 *
 * Query hook for train-search invocations. Wraps the orval-generated
 * `searchTrains` function inside a `useQuery`.
 *
 * Pass `null` to disable the query (e.g. when the form has incomplete
 * input). The hook returns the standard `useQuery` shape; on
 * success `data.data` is a `TrainSearchResponse` with `fromStation`,
 * `toStation`, `date`, `count`, and `trains[]`.
 *
 * @param params - The fully-resolved search params, or `null` to pause.
 * @returns The standard `useQuery` result.
 */
export function useSearchTrains(params: SearchTrainsParams | null) {
  return useQuery({
    queryKey: params
      ? searchKeys.trains(params)
      : [...searchKeys.all, "trains", "idle"],
    queryFn: ({ signal }) => {
      if (!params) {
        // This branch is unreachable because `enabled` gates the call,
        // but the type guard keeps the return type clean.
        throw new Error("useSearchTrains called without params")
      }
      return searchTrains(params, { signal })
    },
    enabled: params !== null,
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
  })
}
