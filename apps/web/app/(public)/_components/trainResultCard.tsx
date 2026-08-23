"use client"

import Link from "next/link"
import { Train, Clock, MapPin, Wallet, Users, ChevronRight } from "lucide-react"

import { buttonVariants } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import type { TrainSearchResult } from "@/generated"
import { saveBookingTripContext } from "@/lib/booking-session"

/**
 * ## TrainResultCard
 *
 * Presentational card that renders a single `TrainSearchResult` from
 * the search-service response. Persists trip context (UUIDs, codes, train info)
 * to sessionStorage when user clicks "View seats".
 *
 * @param train - The single train payload from the API response.
 */
export function TrainResultCard({
  train,
}: {
  readonly train: TrainSearchResult
}) {
  const statusClass = getStatusClass(train.status)

  const departure = train.from.departureTime
    ? new Date(train.from.departureTime).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—"
  const arrival = train.to.arrivalTime
    ? new Date(train.to.arrivalTime).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—"

  const duration = formatDuration(train.durationMinutes)
  const fareRange = `${train.fareRange.currency} ${train.fareRange.min}–${train.fareRange.max}`

  const handleSaveTripContext = () => {
    saveBookingTripContext({
      scheduleId: train.scheduleId,
      trainName: train.trainName,
      trainNumber: train.trainNumber,
      fromStationId: train.from.stationId,
      fromStationCode: train.from.code,
      fromStationName: train.from.name,
      toStationId: train.to.stationId,
      toStationCode: train.to.code,
      toStationName: train.to.name,
    })
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <CardTitle className="font-mono">
              {train.trainNumber} · {train.trainName}
            </CardTitle>
            <CardDescription>
              <Train className="mr-1 inline h-3.5 w-3.5" />
              {train.category} ·{" "}
              {train.operatingDays.length === 7
                ? "Daily"
                : train.operatingDays.join(", ")}
            </CardDescription>
          </div>
          <span
            className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${statusClass}`}
          >
            {train.status}
          </span>
        </div>
      </CardHeader>

      <Separator />

      <CardContent className="space-y-4">
        {/* Departure / arrival */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <p className="text-xs tracking-wider text-muted-foreground uppercase">
              Departure
            </p>
            <p className="text-lg font-semibold">{departure}</p>
            <p className="text-sm text-muted-foreground">
              {train.from.code} · {train.from.name}
              {train.from.platform ? ` · Platform ${train.from.platform}` : ""}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs tracking-wider text-muted-foreground uppercase">
              Arrival
            </p>
            <p className="text-lg font-semibold">{arrival}</p>
            <p className="text-sm text-muted-foreground">
              {train.to.code} · {train.to.name}
              {train.to.platform ? ` · Platform ${train.to.platform}` : ""}
            </p>
          </div>
        </div>

        {/* Meta row: duration, distance, fare, capacity */}
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <Clock className="h-4 w-4" />
            {duration}
          </span>
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <MapPin className="h-4 w-4" />
            {train.distanceKm} km
          </span>
          <span className="inline-flex items-center gap-1.5 font-medium">
            <Wallet className="h-4 w-4" />
            {fareRange}
          </span>
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <Users className="h-4 w-4" />
            {train.availableSeats.total} seats
          </span>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end">
          <Link
            href={`/trains/${train.scheduleId}/seat-map?from=${train.from.code}&to=${train.to.code}`}
            className={buttonVariants({ variant: "outline", size: "sm" })}
            onClick={handleSaveTripContext}
          >
            View seats
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Formats a duration in minutes as `Xh Ym` (e.g. `17h 30m`).
 */
function formatDuration(minutes: number | null): string {
  if (minutes == null || minutes <= 0) return "—"
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  if (hours === 0) return `${remainingMinutes}m`
  if (remainingMinutes === 0) return `${hours}h`
  return `${hours}h ${remainingMinutes}m`
}

/**
 * Returns CSS badge styling classes based on train status.
 */
function getStatusClass(status: string): string {
  switch (status) {
    case "ACTIVE":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
    case "CANCELLED":
      return "border-destructive/40 bg-destructive/10 text-destructive"
    default:
      return "border-muted-foreground/40 bg-muted text-muted-foreground"
  }
}
