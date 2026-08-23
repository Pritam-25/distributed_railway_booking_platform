"use client"

import { useMemo } from "react"
import { Armchair, Lock, Check } from "lucide-react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { SeatMapCoach, SeatMapSeat } from "@/generated"

interface SeatMapGridProps {
  readonly coach: SeatMapCoach
  readonly selectedSeatIds?: string[]
  readonly onToggleSeat?: (seat: SeatMapSeat) => void
  readonly heldSeatIds?: string[]
}

/**
 * ## SeatMapGrid
 *
 * Renders the seat grid for a single coach. Seats are laid out in a
 * 5-column grid with a 1-column aisle between columns 3 and 4 — the
 * conventional Indian railway layout (3+2 for SL, 2+2 for 3AC, etc.).
 *
 * Booked / held seats are visually disabled with a lock icon; available seats
 * are selectable up to 6 seats per booking.
 */
export function SeatMapGrid({
  coach,
  selectedSeatIds = [],
  onToggleSeat,
  heldSeatIds = [],
}: SeatMapGridProps) {
  const selectedSet = useMemo(() => new Set(selectedSeatIds), [selectedSeatIds])
  const heldSet = useMemo(() => new Set(heldSeatIds), [heldSeatIds])

  const bookedCount = useMemo(
    () =>
      coach.seats.filter((s) => s.isBooked && !heldSet.has(s.seatId)).length,
    [coach.seats, heldSet]
  )
  const lockedCount = useMemo(
    () =>
      coach.seats.filter(
        (s) => heldSet.has(s.seatId) || (!s.isBooked && heldSet.has(s.seatId))
      ).length,
    [coach.seats, heldSet]
  )
  const availableCount = coach.totalSeats - (bookedCount + lockedCount)
  const layout = useMemo(() => computeLayout(coach.seats), [coach.seats])

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div className="space-y-1">
          <CardTitle className="font-mono">Coach {coach.coachNumber}</CardTitle>
          <p className="text-xs text-muted-foreground">
            Type {coach.coachType} · {coach.totalSeats} seats
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
            {availableCount} available
          </span>
          {lockedCount > 0 && (
            <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {lockedCount} locked
            </span>
          )}
          {bookedCount > 0 && (
            <span className="rounded-full border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-700 dark:text-red-400">
              {bookedCount} booked
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

          {/* Seat matrix */}
          <div className="flex flex-col gap-1.5">
            {layout.map((row) => (
              <div
                key={row.id}
                className="grid grid-cols-[repeat(3,minmax(0,1fr))_18px_repeat(2,minmax(0,1fr))] items-center gap-1.5"
              >
                {row.left.map((seat) => (
                  <SeatTile
                    key={seat.seatId}
                    seat={seat}
                    isSelected={selectedSet.has(seat.seatId)}
                    isHeld={heldSet.has(seat.seatId)}
                    onToggleSeat={onToggleSeat}
                  />
                ))}
                <div aria-hidden="true" className="h-9" />
                {row.right.map((seat) => (
                  <SeatTile
                    key={seat.seatId}
                    seat={seat}
                    isSelected={selectedSet.has(seat.seatId)}
                    isHeld={heldSet.has(seat.seatId)}
                    onToggleSeat={onToggleSeat}
                  />
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
 * One seat cell. Held seats are rendered disabled in Gray with 'Locked';
 * Confirmed booked seats are rendered disabled in Red with 'Booked';
 * Selected seats show a primary highlight with a check mark.
 */
function SeatTile({
  seat,
  isSelected,
  isHeld,
  onToggleSeat,
}: {
  readonly seat: SeatMapSeat
  readonly isSelected: boolean
  readonly isHeld: boolean
  readonly onToggleSeat?: (seat: SeatMapSeat) => void
}) {
  const isLocked = isHeld
  const isBooked = seat.isBooked && !isHeld

  const label = `Seat ${seat.seatNumber}, ${seat.seatType} berth, ${seat.berthType}, ${seat.quota} quota, ₹${seat.price}`
  const title = getSeatTitle(seat, isBooked, isLocked, isSelected)
  const tileClass = getSeatTileClass(isBooked, isLocked, isSelected)

  const isDisabled = isBooked || isLocked

  const handleClick = () => {
    onToggleSeat?.(seat)
  }

  return (
    <button
      type="button"
      disabled={isDisabled}
      aria-label={label}
      aria-pressed={isSelected}
      onClick={handleClick}
      title={title}
      className={cn(
        "inline-flex h-9 items-center justify-center gap-1 rounded-md border font-mono text-xs transition-all",
        "focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
        tileClass
      )}
    >
      {renderSeatIcon(isBooked, isLocked, isSelected)}
      <span>{seat.seatNumber}</span>
    </button>
  )
}

function getSeatTitle(
  seat: SeatMapSeat,
  isBooked: boolean,
  isLocked: boolean,
  isSelected: boolean
): string {
  if (isBooked) {
    return `Seat ${seat.seatNumber} — Booked`
  }
  if (isLocked) {
    return `Seat ${seat.seatNumber} — Locked`
  }
  if (isSelected) {
    return `Seat ${seat.seatNumber} — Selected`
  }
  return `Seat ${seat.seatNumber} — ₹${seat.price} (${seat.seatType})`
}

function getSeatTileClass(
  isBooked: boolean,
  isLocked: boolean,
  isSelected: boolean
): string {
  if (isBooked) {
    return "cursor-not-allowed border-red-500/40 bg-red-500/15 text-red-600 dark:bg-red-950/40 dark:text-red-400 dark:border-red-800 font-medium"
  }
  if (isLocked) {
    return "cursor-not-allowed border-border/60 bg-muted text-muted-foreground/80 line-through"
  }
  if (isSelected) {
    return "scale-105 cursor-pointer border-primary bg-primary font-bold text-primary-foreground shadow-md ring-2 ring-primary/40"
  }
  return "cursor-pointer border-primary/30 bg-primary/10 text-primary hover:border-primary/60 hover:bg-primary/20 active:translate-y-px"
}

function renderSeatIcon(
  isBooked: boolean,
  isLocked: boolean,
  isSelected: boolean
) {
  if (isBooked) {
    return (
      <Lock
        className="h-3 w-3 text-red-500 dark:text-red-400"
        aria-hidden="true"
      />
    )
  }
  if (isLocked) {
    return <Lock className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
  }
  if (isSelected) {
    return (
      <Check
        className="h-3.5 w-3.5 stroke-[3] text-primary-foreground"
        aria-hidden="true"
      />
    )
  }
  return <Armchair className="h-3 w-3" aria-hidden="true" />
}

interface SeatLayoutRow {
  readonly id: string
  readonly left: SeatMapSeat[]
  readonly right: SeatMapSeat[]
}

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
