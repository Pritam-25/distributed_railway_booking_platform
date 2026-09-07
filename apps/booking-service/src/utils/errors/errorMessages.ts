import { type ErrorCode } from "./errorCodes.js";

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  SCHEDULE_INVENTORY_NOT_FOUND: "Schedule inventory not found",
  SCHEDULE_NOT_FOUND: "Schedule not found for the requested identifier.",
  SCHEDULE_INACTIVE: "Schedule is no longer accepting bookings.",
  TRAIN_ALREADY_DEPARTED: "Train has already departed for this schedule.",
  BOOKING_NOT_FOUND: "Booking not found.",
  BOOKING_FORBIDDEN: "You do not have access to this booking.",
  BOOKING_INVALID_TRANSITION:
    "Booking cannot transition to the requested status from its current state.",
  SEAT_HOLD_FAILED:
    "One or more requested seats could not be held for this booking.",
  SEAT_HOLD_EXPIRED:
    "The seat hold for this booking has expired before confirmation.",
  INVALID_SEAT_IDS: "One or more selected seats are invalid for this schedule.",
  SEAT_UNAVAILABLE:
    "One or more selected seats are no longer available for this journey.",
  INVALID_ROUTE:
    "The requested origin and destination stations are invalid for this train route.",
  CANCELLATION_NOT_ALLOWED:
    "Booking cannot be cancelled in its current state or past the cancellation cutoff.",
};
