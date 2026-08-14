import { type ErrorCode } from "./errorCodes.js";

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  SCHEDULE_INVENTORY_NOT_FOUND: "Schedule inventory not found",
  BOOKING_NOT_FOUND: "Booking not found.",
  BOOKING_FORBIDDEN: "You do not have access to this booking.",
  BOOKING_INVALID_TRANSITION:
    "Booking cannot transition to the requested status from its current state.",
};
