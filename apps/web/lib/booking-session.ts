export interface BookingTripContext {
  scheduleId: string
  trainName: string
  trainNumber: string
  fromStationId: string // UUID required by Booking Service
  fromStationCode: string
  fromStationName: string
  toStationId: string // UUID required by Booking Service
  toStationCode: string
  toStationName: string
  fromSequence?: number
  toSequence?: number
}

const STORAGE_KEY = "irctc_booking_trip_context"

/**
 * Persists selected train trip details to sessionStorage when a user clicks "View seats".
 */
export function saveBookingTripContext(context: BookingTripContext): void {
  if (typeof window === "undefined") return
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(context))
  } catch (err) {
    console.error("Failed to save booking trip context to sessionStorage", err)
  }
}

/**
 * Retrieves the stored train trip context from sessionStorage for the given scheduleId.
 */
export function getBookingTripContext(
  scheduleId?: string
): BookingTripContext | null {
  if (typeof window === "undefined") return null
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as BookingTripContext
    if (scheduleId && parsed.scheduleId !== scheduleId) {
      return null
    }
    return parsed
  } catch {
    return null
  }
}
