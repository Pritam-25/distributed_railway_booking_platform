"use client"

import { useEffect, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"

import { seatMapKeys } from "./keys"

export interface BookingStatusChangedEvent {
  eventId: string
  bookingId: string
  pnr: string
  userId: string
  previousStatus: string | null
  currentStatus: string
  version: number
  updatedAt: string
}

/**
 * ## useBookingEvents
 *
 * Real-time SSE hook for listening to `booking.status_changed` events
 * emitted by `booking-service` for a specific booking.
 *
 * Opens a long-lived `EventSource` connection to `/api/v1/bookings/:bookingId/events`.
 * Automatically invalidates active queries (such as seat-map and booking details)
 * whenever a new status transition occurs.
 *
 * @param bookingId - UUID of the active booking, or `null` to pause listening.
 */
export function useBookingEvents(bookingId: string | null) {
  const queryClient = useQueryClient()
  const [latestStatus, setLatestStatus] = useState<string | null>(null)
  const [latestEvent, setLatestEvent] =
    useState<BookingStatusChangedEvent | null>(null)
  const [events, setEvents] = useState<BookingStatusChangedEvent[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!bookingId) {
      return
    }

    const rawApiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"
    const baseURL = rawApiUrl.replace(/\/api\/v1\/?$/, "")
    const sseUrl = `${baseURL}/api/v1/bookings/${bookingId}/events`

    const eventSource = new EventSource(sseUrl, { withCredentials: true })

    eventSource.onopen = () => {
      setIsConnected(true)
      setError(null)
    }

    eventSource.onerror = () => {
      setIsConnected(false)
      if (eventSource.readyState === EventSource.CLOSED) {
        setError("Event stream closed.")
      } else {
        setError("Connecting to booking event stream...")
      }
    }

    const handleStatusChanged = (e: MessageEvent) => {
      try {
        const payload: BookingStatusChangedEvent = JSON.parse(e.data)
        setLatestStatus(payload.currentStatus)
        setLatestEvent(payload)
        setEvents((prev) => [...prev, payload])

        // Invalidate and refetch seat-map queries so the UI seat-map and booking status auto-refresh
        void queryClient.invalidateQueries({ queryKey: seatMapKeys.all })
        void queryClient.refetchQueries({ queryKey: seatMapKeys.all })
      } catch (err) {
        console.error("Failed to parse SSE booking status payload:", err)
      }
    }

    eventSource.addEventListener("booking.status_changed", handleStatusChanged)

    return () => {
      eventSource.removeEventListener(
        "booking.status_changed",
        handleStatusChanged
      )
      eventSource.close()
      setIsConnected(false)
      setLatestStatus(null)
      setLatestEvent(null)
      setEvents([])
      setError(null)
    }
  }, [bookingId, queryClient])

  return {
    latestStatus,
    latestEvent,
    events,
    isConnected,
    error,
  }
}
