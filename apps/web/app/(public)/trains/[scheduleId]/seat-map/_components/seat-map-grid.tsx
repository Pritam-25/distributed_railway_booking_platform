"use client"

import { Armchair, Lock } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { SeatMapCoach, SeatMapSeat } from "@/generated"

/**
 * ## SeatMapGrid
 *
 * Renders the seat grid for a single coach. Seats are laid out in a
 * 5-column grid with a 1-column aisle between columns 3 and 4 — the
 * conventional Indian railway layout (3+2 for SL, 2+2 for 3AC, etc.).
 *
 * Booked seats are visually disabled (`isBooked=true`); available
 * seats are hoverable. The seat number is rendered as the visible
 * label so the user can correlate with the booking flow.
 *
 * @param coach - The coach payload from the seat-map response.
 */
export function SeatMapGrid({ coach }: { readonly coach: SeatMapCoach }) {
  const booked = coach.seats.filter((s) => s.isBooked).length
  const available = coach.totalSeats - booked
  const layout = computeLayout(coach.seats)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div className="space-y-1">
          <CardTitle className="font-mono">Coach {coach.coachNumber}</CardTitle>
          <p className="text-xs text-muted-foreground">
            Type {coach.coachType} · {coach.totalSeats} seats
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
            {available} available
          </span>
          {booked > 0 && (
            <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {booked} booked
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent>
        <div className="space-y-2">
          {/* Column header (forward direction) */}
          <div className="flex items-center justify-end gap-2 pb-1 text-[10px] tracking-wider text-muted-foreground uppercase">
            <span>Front of train</span>
          </div>

          {/* Seat matrix. Rows come from the coach's seats; columns
              are inferred from the layout (3+2 by default). */}
          <div className="flex flex-col gap-1.5">
            {layout.map((row) => (
              <div
                key={row.id}
                className="grid grid-cols-[repeat(3,minmax(0,1fr))_18px_repeat(2,minmax(0,1fr))] items-center gap-1.5"
              >
                {row.left.map((seat) => (
                  <SeatTile key={seat.seatId} seat={seat} />
                ))}
                <div aria-hidden className="h-9" />
                {row.right.map((seat) => (
                  <SeatTile key={seat.seatId} seat={seat} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * ## SeatTile
 *
 * One seat cell. Booked seats are rendered with a `disabled`-style
 * surface and a lock icon; available seats are filled with a
 * subdued primary tint and show the seat number.
 *
 * The seat's metadata (type, berth, price, quota) is rendered to
 * the accessibility tree so screen readers can describe the
 * seat without polluting the visual layout.
 */
function SeatTile({ seat }: { readonly seat: SeatMapSeat }) {
  const isBooked = seat.isBooked

  const label = `Seat ${seat.seatNumber}, ${seat.seatType} berth, ${seat.berthType}, ${seat.quota} quota, ₹${seat.price}`

  return (
    <button
      type="button"
      disabled={isBooked}
      aria-label={label}
      aria-pressed={false}
      title={
        isBooked
          ? `Seat ${seat.seatNumber} — booked`
          : `Seat ${seat.seatNumber} — ₹${seat.price} (${seat.seatType})`
      }
      className={cn(
        "inline-flex h-9 items-center justify-center gap-1 rounded-md border font-mono text-xs transition-all",
        "focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
        isBooked
          ? "cursor-not-allowed border-border/60 bg-muted text-muted-foreground/70 line-through"
          : "cursor-pointer border-primary/30 bg-primary/10 text-primary hover:border-primary/60 hover:bg-primary/20 active:translate-y-px"
      )}
    >
      {isBooked ? (
        <Lock className="h-3 w-3" aria-hidden />
      ) : (
        <Armchair className="h-3 w-3" aria-hidden />
      )}
      <span>{seat.seatNumber}</span>
    </button>
  )
}

interface SeatLayoutRow {
  readonly id: string
  readonly left: SeatMapSeat[]
  readonly right: SeatMapSeat[]
}

/**
 * Splits the seats into left-half (3 seats) / right-half (2 seats) rows
 * for a 3+2 visual layout. Falls back to a single-column packing when
 * the seat count is not divisible by 5 — anything that doesn't fit the
 * 3+2 cadence still renders, just on a denser row.
 */
function computeLayout(seats: SeatMapSeat[]): readonly SeatLayoutRow[] {
  const rows: SeatLayoutRow[] = []
  let pending: SeatMapSeat[] = []

  for (const seat of seats) {
    pending.push(seat)
    if (pending.length === 5) {
      const firstSeatId = pending[0]?.seatId ?? `row-${rows.length}`
      rows.push({
        id: `row-${firstSeatId}`,
        left: pending.slice(0, 3),
        right: pending.slice(3, 5),
      })
      pending = []
    }
  }

  if (pending.length > 0) {
    const firstSeatId = pending[0]?.seatId ?? `row-${rows.length}`
    const half = Math.ceil(pending.length / 2)
    rows.push({
      id: `row-${firstSeatId}`,
      left: pending.slice(0, half),
      right: pending.slice(half),
    })
  }

  return rows
}
