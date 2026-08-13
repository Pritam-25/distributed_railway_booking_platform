"use client"

import { use } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { Armchair, ChevronLeft } from "lucide-react"

import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { GetSeatMapParams } from "@/generated/model/getSeatMapParams"

import { useSeatMap } from "../_hooks"

import { SeatMapEmpty } from "./seat-map-empty"
import { SeatMapError } from "./seat-map-error"
import { SeatMapGrid } from "./seat-map-grid"
import { SeatMapSkeleton } from "./seat-map-skeleton"

/**
 * ## SeatMapPage
 *
 * Top-level client component for the
 * `/trains/[scheduleId]/seat-map?fromStationId=...&toStationId=...`
 * route. Reads the dynamic route segment + query string, hydrates the
 * `useSeatMap` query, and renders one of four states:
 *
 * - **loading** → `SeatMapSkeleton`
 * - **error**   → `SeatMapError` with Retry wired to `refetch`
 * - **empty**   → `SeatMapEmpty` (success but no coaches)
 * - **success** → header card + one `SeatMapGrid` per coach
 *
 * Three states are user-visible failures:
 * 1. The route param `scheduleId` is missing (shouldn't happen given
 *    Next.js routing, but defended against).
 * 2. Either query param (`fromStationId`, `toStationId`) is missing
 *    → renders a card asking the user to go back and pick a route.
 * 3. The two station UUIDs match → renders a card explaining the
 *    request was invalid.
 *
 * @param params - The dynamic route segment. Wrapped in React's
 *   `use()` because Next.js ships the params as a promise in v15+.
 */
export function SeatMapPage({
  params,
}: {
  readonly params: Promise<{ readonly scheduleId: string }>
}) {
  const routeParams = use(params)
  const searchParams = useSearchParams()

  const scheduleId = routeParams.scheduleId
  const fromStationId =
    searchParams.get("fromStationId") ??
    searchParams.get("fromStation") ??
    searchParams.get("from")
  const toStationId =
    searchParams.get("toStationId") ??
    searchParams.get("toStation") ??
    searchParams.get("to")

  if (!fromStationId || !toStationId) {
    return <MissingQueryParamsCard />
  }

  if (fromStationId === toStationId) {
    return <SameStationCard />
  }

  return (
    <SeatMapView
      scheduleId={scheduleId}
      params={{ fromStationId, toStationId }}
    />
  )
}

/**
 * ## SeatMapView
 *
 * Inner view that owns the `useSeatMap` query. Splitting this out
 * keeps `SeatMapPage` declarative and prevents unnecessary query
 * instantiation when the URL is missing required params.
 */
function SeatMapView({
  scheduleId,
  params,
}: {
  readonly scheduleId: string
  readonly params: GetSeatMapParams
}) {
  const {
    data: response,
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
  } = useSeatMap(scheduleId, params)

  if (isLoading) {
    return <SeatMapSkeleton />
  }

  if (isError) {
    return (
      <SeatMapError
        error={error}
        onRetry={() => {
          void refetch()
        }}
        isRefetching={isRefetching}
      />
    )
  }

  const payload = response?.data
  const coaches = payload?.coaches ?? []

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary shadow-sm">
          <Armchair className="h-6 w-6" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">Seat Map</h1>
          <p className="text-sm text-muted-foreground">
            Booked seats are shown locked. Pick an available seat to continue
            with booking.
          </p>
        </div>
        <BackToSearchLink />
      </header>

      {/* Summary card */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-card px-6 py-4 ring-1 ring-foreground/10">
        <div className="space-y-1">
          <div className="flex items-center gap-2 font-semibold text-foreground">
            <span>{truncate(params.fromStationId)}</span>
            <span className="text-muted-foreground">→</span>
            <span>{truncate(params.toStationId)}</span>
          </div>
          <p className="text-xs text-muted-foreground">Train Seat Layout</p>
        </div>
        <div className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          Select Your Seat
        </div>
      </div>

      {/* Body */}
      {coaches.length === 0 ? (
        <SeatMapEmpty />
      ) : (
        <div className="flex flex-col gap-4">
          {coaches.map((coach) => (
            <SeatMapGrid key={coach.coachId} coach={coach} />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * Renders when the URL is missing one of the required query params.
 * This is a pre-query failure — `useSeatMap` is never called.
 */
function MissingQueryParamsCard() {
  return (
    <div className="rounded-xl border border-destructive/40 bg-card p-6 text-sm">
      <p className="font-medium text-destructive">Missing route parameters.</p>
      <p className="mt-1 text-muted-foreground">
        Both <code>fromStationId</code> and <code>toStationId</code> are
        required to view a seat map.
      </p>
      <BackToSearchLink className="mt-4" />
    </div>
  )
}

/**
 * Renders when the two station UUIDs match. Mirrors the server-side
 * Zod `.refine` so the user sees a friendly message instead of a
 * 400 from the API.
 */
function SameStationCard() {
  return (
    <div className="rounded-xl border border-destructive/40 bg-card p-6 text-sm">
      <p className="font-medium text-destructive">
        Origin and destination must be different stations.
      </p>
      <p className="mt-1 text-muted-foreground">
        Pick a different route to view its seat layout.
      </p>
      <BackToSearchLink className="mt-4" />
    </div>
  )
}

/**
 * ## BackToSearchLink
 *
 * Shared link to `/` styled with the outline button variant. Lives
 * inside three different cards (the main view, the missing-params
 * fallback, and the same-station fallback) so the same visual rhythm
 * is preserved across every state.
 *
 * @param className - Optional additional classes merged after the
 *   base button styles (e.g. `"mt-4"` to add spacing inside a card).
 */
function BackToSearchLink({ className }: { readonly className?: string }) {
  return (
    <Link
      href="/"
      className={cn(
        buttonVariants({ variant: "outline", size: "sm" }),
        className
      )}
    >
      <ChevronLeft className="h-4 w-4" />
      Back to search
    </Link>
  )
}

/**
 * Truncates a UUID to its first 8 characters for display; leaves short station codes intact.
 */
function truncate(value: string): string {
  if (value.length <= 8 || !value.includes("-")) return value
  return `${value.slice(0, 8)}…`
}
