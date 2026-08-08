"use client"

import { Train } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"

import { useSearchTrains } from "@/app/(public)/_hooks"
import type { SearchTrainsParams } from "@/generated"

import { TrainResultCard } from "./trainResultCard"
import { TrainResultsListSkeleton } from "./trainResultsListSkeleton"
import { TrainSearchError } from "./trainSearchError"

/**
 * ## TrainResultsList
 *
 * Renders the train-search results for a given params payload. Three
 * states:
 *
 * - **loading** → `TrainResultsListSkeleton` (5 card placeholders).
 * - **error**   → `TrainSearchError` with Retry wired to `refetch`.
 * - **success** → header card summarising the resolved search plus a
 *                 vertical stack of `TrainResultCard` items.
 */
export function TrainResultsList({
  params,
}: {
  readonly params: SearchTrainsParams
}) {
  const {
    data: response,
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
  } = useSearchTrains(params)

  if (isLoading) {
    return <TrainResultsListSkeleton />
  }

  if (isError) {
    return (
      <TrainSearchError
        error={error}
        onRetry={() => {
          void refetch()
        }}
        isRefetching={isRefetching}
      />
    )
  }

  const payload = response?.data
  const trains = payload?.trains ?? []
  const count = payload?.count ?? trains.length

  if (trains.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center text-muted-foreground">
          <Train className="h-8 w-8" />
          <p className="text-sm font-medium">
            No trains found for this route on {payload?.date ?? params.date}.
          </p>
          <p className="text-xs">
            Try a different date or relax the category filter.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex items-center justify-between text-sm">
          <div>
            <p className="font-medium">
              {payload?.fromStation.code} → {payload?.toStation.code}
            </p>
            <p className="text-xs text-muted-foreground">
              {payload?.fromStation.name} → {payload?.toStation.name} ·{" "}
              {payload?.date ?? params.date}
            </p>
          </div>
          <p className="text-muted-foreground">
            <span className="font-semibold text-foreground">{count}</span>{" "}
            result
            {count === 1 ? "" : "s"}
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        {trains.map((train) => (
          <TrainResultCard key={train.scheduleId} train={train} />
        ))}
      </div>
    </div>
  )
}
