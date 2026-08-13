"use client"

import { useQuery } from "@tanstack/react-query"

import { getSeatMap } from "@/generated/endpoints/search/search"
import type { GetSeatMapParams } from "@/generated/model/getSeatMapParams"

import { seatMapKeys } from "./keys"

/**
 * ## useSeatMap
 *
 * Query hook for the seat-map endpoint. Wraps the orval-generated
 * `getSeatMap` function inside a `useQuery`.
 *
 * Pass `null` to the params to disable the query (e.g. when the URL
 * is missing one of the three required UUIDs). The hook returns the
 * standard `useQuery` shape; on success `data.data` is a
 * `SeatMapResponse` with `status` and `coaches[]`.
 *
 * `staleTime` matches the server-side cache TTL (60s) so that
 * successive re-mounts within the same minute do not refetch.
 *
 * @param scheduleId - The schedule UUID, or `null` to pause the query.
 * @param params - The `(fromStationId, toStationId)` query DTO, or
 *   `null` to pause the query.
 * @returns The standard `useQuery` result.
 */
export function useSeatMap(
  scheduleId: string | null,
  params: GetSeatMapParams | null
) {
  const isEnabled = scheduleId !== null && params !== null

  return useQuery({
    queryKey: isEnabled
      ? seatMapKeys.seatMap({
          scheduleId,
          fromStationId: params.fromStationId,
          toStationId: params.toStationId,
        })
      : [...seatMapKeys.all, "idle"],
    queryFn: ({ signal }) => {
      if (!scheduleId || !params) {
        // Unreachable because `enabled` gates the call, but the type
        // guard keeps the return type clean.
        throw new Error("useSeatMap called without params")
      }
      return getSeatMap(scheduleId, params, { signal })
    },
    enabled: isEnabled,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  })
}
