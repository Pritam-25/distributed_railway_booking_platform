import { buildEndpointDoc } from "@irctc/openapi";

export const bookingServiceOpenApiDescriptions = {
  bookings: {
    createBooking: buildEndpointDoc({
      summary: "Create Booking",
      overview:
        "Initiates a new booking in the `PENDING` state for the authenticated user. Idempotent on the `idempotencyKey` request field — a retry with the same key returns the original response without re-running the saga.",
      requestBodyFields: [
        "`idempotencyKey` - Client-generated UUID that deduplicates retries.",
        "`scheduleId` - UUID of the `ScheduleInventory` row to book against.",
        "`fromStationId` / `toStationId` - Station UUIDs or station codes (e.g. BCK, HWR) of the segment endpoints (must differ).",
        "`seatIds` - 1 to 6 seat UUIDs from the seat-map.",
        "`passengers` - 1 to 6 passenger records, one per seat.",
      ],
      response:
        "Returns the new booking's id, PNR, and current status in the success envelope's `data` field.",
      outcomes: [
        "201 Created - Booking was created in the `PENDING` state.",
        "400 Bad Request - The request body failed schema validation.",
        "401 Unauthorized - The JWT is missing or invalid.",
        "404 Not Found - The schedule or one of the seats does not exist.",
        "409 Conflict - The seats are already held by another booking or the saga cannot proceed.",
        "429 Too Many Requests - Booking attempts were rate-limited.",
        "500 Internal Server Error - The service could not complete the booking.",
      ],
      notes: [
        "The PNR is generated server-side (10-character alphanumeric) and returned only once in the 201 response. Subsequent GETs on the booking id return the same PNR.",
        "Idempotency keys are stored for the lifetime of the booking; reuse them only for genuine retries, not for distinct bookings.",
      ],
    }),
    getBooking: buildEndpointDoc({
      summary: "Get Booking",
      overview:
        "Returns the booking with the given id, scoped to the authenticated user. Returns 404 if the booking does not exist or belongs to another user (ownership is enforced before the booking is loaded for non-admins).",
      requestBodyFields: ["`bookingId` (path) - UUID of the booking to fetch."],
      response:
        "Returns the full booking record (status, version, segments, seat/passenger rows) in the success envelope's `data` field.",
      outcomes: [
        "200 OK - Booking was found and is owned by the authenticated user.",
        "401 Unauthorized - The JWT is missing or invalid.",
        "404 Not Found - The booking does not exist or belongs to another user.",
        "429 Too Many Requests - Polling exceeded the default rate limit.",
        "500 Internal Server Error - The service could not read the booking.",
      ],
      notes: [
        "The status field reflects the most recent CAS transition. Subscribe to the booking-events SSE stream (Phase 2) for live updates instead of polling.",
      ],
    }),
    cancelBooking: buildEndpointDoc({
      summary: "Cancel Booking",
      overview:
        "Cancels a booking owned by the authenticated user. Drives the row through `CANCELLING` → `CANCELLED` and emits one `BookingStatusChangedV1` event per transition.",
      requestBodyFields: [
        "`bookingId` (path) - UUID of the booking to cancel.",
      ],
      response:
        "Returns the cancelled booking record (status `CANCELLED`) in the success envelope's `data` field.",
      outcomes: [
        "200 OK - The booking was successfully cancelled.",
        "401 Unauthorized - The JWT is missing or invalid.",
        "404 Not Found - The booking does not exist or belongs to another user.",
        "409 Conflict - The booking is already in a terminal state and cannot be cancelled.",
        "429 Too Many Requests - Cancellation attempts were rate-limited.",
        "500 Internal Server Error - The service could not complete cancellation.",
      ],
      notes: [
        "Cancellations on already-confirmed bookings will eventually trigger a refund via payment-service. The booking row flips to `CANCELLED` synchronously, but the refund is asynchronous.",
      ],
    }),
  },
};

export const apiTitle = "Booking Service API";
export const apiVersion = "1.0.0";
export const apiDescription = `
  # Booking Service API

  The **Booking Service API** owns the booking lifecycle for the IRCTC
  Railway Booking Platform. It is the command side of the saga: it
  drives a booking through nine states (PENDING → SEATS_HELD →
  PAYMENT_PENDING → CONFIRMING → CONFIRMED, plus the terminal
  branches FAILED, EXPIRED, CANCELLING → CANCELLED) and emits a
  BookingStatusChangedV1 event to the transactional outbox on every
  successful CAS transition.

  ## Core Capabilities

  ### Booking Lifecycle

  - **Create Booking** — Start a new booking in the PENDING state
    with idempotency-key dedupe.
  - **Get Booking** — Read the current state of a booking owned by
    the authenticated user.
  - **Cancel Booking** — Drive a booking through CANCELLING →
    CANCELLED (refund follows asynchronously via payment-service).

  ### Real-Time Updates (Phase 2 — upcoming)

  - **SSE Booking Events** — A text/event-stream endpoint pushes
    booking.status_changed events to the originating browser tab.
`;
