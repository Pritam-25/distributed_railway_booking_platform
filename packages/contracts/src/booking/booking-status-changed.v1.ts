import { z } from "zod";

/**
 * ## BookingStatus enum (wire string set)
 *
 * Mirrors the `BookingStatus` Prisma enum in `apps/booking-service`.
 * Exported as a TypeScript enum so other modules can reference the
 * literal values; the Zod schema uses `z.enum(MyEnum)` so the union
 * is type-safe at the boundary.
 */
export enum BookingStatus {
  PENDING = "PENDING",
  SEATS_HELD = "SEATS_HELD",
  PAYMENT_PENDING = "PAYMENT_PENDING",
  CONFIRMING = "CONFIRMING",
  CONFIRMED = "CONFIRMED",
  CANCELLING = "CANCELLING",
  CANCELLED = "CANCELLED",
  EXPIRED = "EXPIRED",
  FAILED = "FAILED",
}

/**
 * Published by booking-service on every successful CAS transition of a
 * booking's status. Consumed by booking-service itself to drive an
 * SSE fan-out stream that pushes `booking.status_changed` events to
 * the originating browser tab (the user that owns the booking).
 *
 * @remarks
 * ### Why a versioned event
 * The booking saga progresses through nine states; if the UI polls
 * instead of subscribing it either has to spam the server or risk
 * missing transitions. The SSE stream relies on this event as the
 * sole source of truth for "what is my booking doing right now".
 *
 * ### Emit semantics
 * Every transition writes one row to `outboxEvent` inside the same
 * Prisma transaction that updates the booking row. The outbox worker
 * drains to Kafka. If the outbox write fails the booking update
 * fails too — there is no scenario where the DB transitions without
 * the event firing.
 *
 * ### Consumer behaviour
 * Consumers must use `safeParse()` and route parse failures to the
 * DLQ. Missing or malformed fields mean the event was published by
 * a malformed producer; the consumer cannot recover.
 *
 * ### Versioning
 * Bump to V2 with a new schema (and new topic) when the payload
 * shape changes. Don't extend this schema in place.
 *
 * Wire format: JSON. `updatedAt` is published as a Date object; the
 * publisher's `JSON.stringify` converts it to an ISO 8601 string on
 * the wire. `z.coerce.date()` round-trips it back to a Date on the
 * consumer side, so the in-memory type is `Date` everywhere.
 */
export const BookingStatusChangedV1 = z.object({
  eventId: z.uuid(),
  bookingId: z.uuid(),
  pnr: z.string().min(1),
  userId: z.uuid(),
  previousStatus: z.enum(BookingStatus).nullable(),
  currentStatus: z.enum(BookingStatus),
  version: z.number().int().nonnegative(),
  updatedAt: z.coerce.date(),
});

export type BookingStatusChangedV1Type = z.infer<typeof BookingStatusChangedV1>;
