"use client"

import { use, useState, useMemo } from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  Armchair,
  ChevronLeft,
  Ticket,
  ArrowRight,
  Loader2,
  Train,
  Lock,
} from "lucide-react"

import { Button, buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { GetSeatMapParams } from "@/generated/model/getSeatMapParams"
import type { SeatMapSeat } from "@/generated"
import {
  createBookingSchema,
  type CreateBookingFormValues,
} from "@/lib/schemas/booking"
import { getBookingTripContext } from "@/lib/booking-session"

import { useSeatMap, useCreateBooking } from "../_hooks"

import { SeatMapEmpty } from "./seat-map-empty"
import { SeatMapError } from "./seat-map-error"
import { SeatMapGrid } from "./seat-map-grid"
import { SeatMapSkeleton } from "./seat-map-skeleton"
import { PassengerFormCard } from "./passenger-form"
import { BookingStatusModal } from "./booking-status-modal"

/**
 * ## SeatMapPage
 *
 * Top-level client component for the
 * `/trains/[scheduleId]/seat-map?from=...&to=...`
 * route. Hydrates `useSeatMap` using search station codes (`from` & `to`),
 * retrieves UUIDs & trip context from `sessionStorage` for `createBooking`,
 * handles multi-seat selection, React Hook Form + Zod validation,
 * booking creation, and real-time SSE updates.
 */
export function SeatMapPage({
  params,
}: {
  readonly params: Promise<{ readonly scheduleId: string }>
}) {
  const routeParams = use(params)
  const searchParams = useSearchParams()

  const scheduleId = routeParams.scheduleId
  const fromStation = searchParams.get("from")
  const toStation = searchParams.get("to")

  if (!fromStation || !toStation) {
    return <MissingQueryParamsCard />
  }

  if (fromStation === toStation) {
    return <SameStationCard />
  }

  return (
    <SeatMapView scheduleId={scheduleId} params={{ fromStation, toStation }} />
  )
}

/**
 * ## SeatMapView
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

  const createBookingMutation = useCreateBooking()

  const [selectedSeats, setSelectedSeats] = useState<SeatMapSeat[]>([])
  const [apiError, setApiError] = useState<string | null>(null)

  const [activeBookingId, setActiveBookingId] = useState<string | null>(null)
  const [activePnr, setActivePnr] = useState<string | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  // Retrieve trip context (UUIDs, train name, station details) directly from sessionStorage
  const tripContext = useMemo(
    () => getBookingTripContext(scheduleId),
    [scheduleId]
  )

  // Resolve station UUIDs & sequences for Booking Service payload from sessionStorage (or fallback to param)
  const fromStationId = tripContext?.fromStationId ?? params.fromStation ?? ""
  const toStationId = tripContext?.toStationId ?? params.toStation ?? ""
  const fromSequence = tripContext?.fromSequence
  const toSequence = tripContext?.toSequence

  // React Hook Form initialized with full CreateBooking Zod Resolver
  const form = useForm<CreateBookingFormValues>({
    resolver: zodResolver(createBookingSchema),
    defaultValues: {
      scheduleId,
      fromStationId,
      toStationId,
      fromSequence,
      toSequence,
      seatIds: [],
      passengers: [],
    },
  })

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
  const selectedSeatIds = selectedSeats.map((s) => s.seatId)
  const totalPrice = selectedSeats.reduce(
    (acc, s) => acc + (Number(s.price) || 0),
    0
  )

  const handleToggleSeat = (seat: SeatMapSeat) => {
    setApiError(null)
    const currentPassengers = form.getValues("passengers") ?? []
    const existsIndex = currentPassengers.findIndex(
      (p) => p.seatId === seat.seatId
    )

    if (existsIndex >= 0) {
      // Deselect seat
      const nextSeats = selectedSeats.filter((s) => s.seatId !== seat.seatId)
      const nextPassengers = currentPassengers.filter(
        (_, index) => index !== existsIndex
      )
      setSelectedSeats(nextSeats)
      form.setValue(
        "seatIds",
        nextSeats.map((s) => s.seatId),
        { shouldValidate: true }
      )
      form.setValue("passengers", nextPassengers, { shouldValidate: true })
    } else {
      // Select seat (up to 6)
      if (selectedSeats.length >= 6) {
        setApiError("Maximum 6 seats per booking.")
        return
      }

      const nextSeats = [...selectedSeats, seat]
      const nextPassengers = [
        ...currentPassengers,
        {
          seatId: seat.seatId,
          seatNumber: seat.seatNumber,
          fullName: "",
          age: 30,
          gender: "MALE" as const,
          berthPreference: "LOWER" as const,
        },
      ]
      setSelectedSeats(nextSeats)
      form.setValue(
        "seatIds",
        nextSeats.map((s) => s.seatId),
        { shouldValidate: true }
      )
      form.setValue("passengers", nextPassengers, { shouldValidate: true })
    }
  }

  const handleDeselectSeat = (seatId: string) => {
    const nextSeats = selectedSeats.filter((s) => s.seatId !== seatId)
    const currentPassengers = form.getValues("passengers") ?? []
    const nextPassengers = currentPassengers.filter((p) => p.seatId !== seatId)
    setSelectedSeats(nextSeats)
    form.setValue(
      "seatIds",
      nextSeats.map((s) => s.seatId),
      { shouldValidate: true }
    )
    form.setValue("passengers", nextPassengers, { shouldValidate: true })
  }

  const onSubmit = (values: CreateBookingFormValues) => {
    setApiError(null)

    createBookingMutation.mutate(
      {
        scheduleId: values.scheduleId,
        fromStationId: values.fromStationId,
        toStationId: values.toStationId,
        fromSequence: values.fromSequence,
        toSequence: values.toSequence,
        seatIds: values.seatIds,
        passengers: values.passengers.map((p) => ({
          fullName: p.fullName,
          age: p.age,
          gender: p.gender,
          berthPreference: p.berthPreference ?? undefined,
        })),
      },
      {
        onSuccess: (res) => {
          const booking = res.data
          setActiveBookingId(booking.id)
          setActivePnr(booking.pnr)
          setIsModalOpen(true)
          setSelectedSeats([])
          form.reset({
            scheduleId,
            fromStationId,
            toStationId,
            fromSequence,
            toSequence,
            seatIds: [],
            passengers: [],
          })
        },
        onError: (err: unknown) => {
          const apiErr = err as {
            response?: { data?: { error?: { message?: string } } }
            message?: string
          }
          const errorMsg =
            apiErr.response?.data?.error?.message ||
            apiErr.message ||
            "Could not initiate booking. Please retry."
          setApiError(errorMsg)
        },
      }
    )
  }

  const onInvalid = () => {
    setApiError(
      "Please provide all required passenger details (e.g. Passenger Name)."
    )
    const card = document.getElementById("passenger-form-card")
    card?.scrollIntoView({ behavior: "smooth" })
  }

  const getFirstPassengerErrorMessage = () => {
    const pErrs = form.formState.errors.passengers
    if (!pErrs) return null
    if (Array.isArray(pErrs)) {
      for (let i = 0; i < pErrs.length; i++) {
        const err = pErrs[i]
        if (err?.fullName?.message)
          return `Passenger ${i + 1}: ${err.fullName.message}`
        if (err?.age?.message) return `Passenger ${i + 1}: ${err.age.message}`
        if (err?.gender?.message)
          return `Passenger ${i + 1}: ${err.gender.message}`
      }
      return null
    }
    const errObj = pErrs as { root?: { message?: string }; message?: string }
    return errObj.root?.message || errObj.message || null
  }

  const rootErrorMsg =
    apiError ||
    form.formState.errors.scheduleId?.message ||
    form.formState.errors.fromStationId?.message ||
    form.formState.errors.toStationId?.message ||
    form.formState.errors.seatIds?.message ||
    getFirstPassengerErrorMessage()

  const displayFrom = tripContext
    ? `${tripContext.fromStationCode} (${tripContext.fromStationName})`
    : params.fromStation
  const displayTo = tripContext
    ? `${tripContext.toStationCode} (${tripContext.toStationName})`
    : params.toStation

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit, onInvalid)}
      className="space-y-6 pb-24"
    >
      {/* Header */}
      <header className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary shadow-sm">
          <Armchair className="h-6 w-6" />
        </div>
        <div className="flex-1">
          <h1 className="text-2xl font-bold tracking-tight">
            Train Seat Layout & Booking
          </h1>
          <p className="text-sm text-muted-foreground">
            {tripContext ? (
              <span className="font-medium text-foreground">
                <Train className="mr-1 inline h-3.5 w-3.5" />
                {tripContext.trainNumber} · {tripContext.trainName}
              </span>
            ) : (
              "Select up to 6 seats, enter passenger info, and track seat reservation live."
            )}
          </p>
        </div>
        <BackToSearchLink />
      </header>

      {/* Summary card */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-card px-6 py-4 ring-1 ring-foreground/10">
        <div className="space-y-1">
          <div className="flex items-center gap-2 font-semibold text-foreground">
            <span>{displayFrom}</span>
            <span className="text-muted-foreground">→</span>
            <span>{displayTo}</span>
          </div>
          <p className="text-xs text-muted-foreground">Interactive Seat Map</p>
        </div>
        <div className="flex items-center gap-3">
          {selectedSeats.length > 0 && (
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              {selectedSeats.length} Seat{selectedSeats.length > 1 ? "s" : ""}{" "}
              Selected
            </span>
          )}
        </div>
      </div>

      {rootErrorMsg && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm font-medium text-destructive">
          {rootErrorMsg}
        </div>
      )}

      {/* Passenger Details Form Card */}
      <PassengerFormCard
        selectedSeats={selectedSeats}
        form={form}
        onDeselectSeat={handleDeselectSeat}
      />

      {/* Coaches & Seat Grid */}
      {coaches.length === 0 ? (
        <SeatMapEmpty />
      ) : (
        <div className="flex flex-col gap-6">
          {/* Seat Status Legend */}
          <div className="flex flex-wrap items-center gap-6 rounded-xl border border-border bg-card px-5 py-3 text-xs shadow-sm">
            <span className="font-semibold text-muted-foreground">
              Seat Legend:
            </span>
            <div className="flex items-center gap-1.5">
              <div className="h-4 w-4 rounded border border-primary/30 bg-primary/10" />
              <span className="text-foreground">Available</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="flex h-4 w-4 items-center justify-center rounded border border-primary bg-primary text-[9px] font-bold text-primary-foreground">
                ✓
              </div>
              <span className="font-medium text-foreground">Selected</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="flex h-4 w-4 items-center justify-center rounded border border-border bg-muted text-[9px] text-muted-foreground">
                <Lock className="h-2.5 w-2.5" />
              </div>
              <span className="font-medium text-muted-foreground">
                Locked (Held)
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="flex h-4 w-4 items-center justify-center rounded border border-red-500/40 bg-red-500/15 text-[9px] text-red-600 dark:text-red-400">
                <Lock className="h-2.5 w-2.5 text-red-500 dark:text-red-400" />
              </div>
              <span className="font-medium text-red-600 dark:text-red-400">
                Booked
              </span>
            </div>
          </div>

          {coaches.map((coach) => (
            <SeatMapGrid
              key={coach.coachId}
              coach={coach}
              selectedSeatIds={selectedSeatIds}
              onToggleSeat={handleToggleSeat}
              heldSeatIds={activeBookingId ? selectedSeatIds : []}
            />
          ))}
        </div>
      )}

      {/* Sticky Bottom Booking Action Bar */}
      {selectedSeats.length > 0 && (
        <div className="fixed right-0 bottom-0 left-0 z-40 border-t border-border bg-card/95 p-4 shadow-lg backdrop-blur-md">
          <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
            <div className="space-y-0.5">
              <div className="text-xs text-muted-foreground">
                Total Price ({selectedSeats.length} Seat
                {selectedSeats.length > 1 ? "s" : ""})
              </div>
              <div className="font-mono text-xl font-bold text-foreground">
                ₹{totalPrice.toLocaleString("en-IN")}
              </div>
            </div>

            <Button
              type="submit"
              size="lg"
              className="gap-2 font-semibold shadow-md"
              disabled={createBookingMutation.isPending}
            >
              {createBookingMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Initiating Reservation...
                </>
              ) : (
                <>
                  <Ticket className="h-5 w-5" />
                  Proceed to Book ({selectedSeats.length})
                  <ArrowRight className="ml-1 h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Real-time SSE Booking Status Modal */}
      <BookingStatusModal
        bookingId={activeBookingId}
        initialPnr={activePnr}
        open={isModalOpen}
        onClose={() => setIsModalOpen(false)}
      />
    </form>
  )
}

function MissingQueryParamsCard() {
  return (
    <div className="rounded-xl border border-destructive/40 bg-card p-6 text-sm">
      <p className="font-medium text-destructive">Missing route parameters.</p>
      <p className="mt-1 text-muted-foreground">
        Both <code>from</code> and <code>to</code> station parameters are
        required to view a seat map.
      </p>
      <BackToSearchLink className="mt-4" />
    </div>
  )
}

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
