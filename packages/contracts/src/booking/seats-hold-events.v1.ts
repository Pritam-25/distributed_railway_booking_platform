import { z } from "zod";

/**
 * ## Hold Seats Requested
 *
 * Published by booking-service when a new booking enters the saga and wants
 * inventory-service to reserve specific seats for a segment range. Consumed
 * by inventory-service's `hold-seats` consumer.
 *
 * ### Wire shape
 * `seatInventoryIds` carries the canonical seat rows from the inventory
 * projection (`SeatInventory.id` values). `fromSequence` / `toSequence` are
 * the route-stop sequence indices that bound the journey segment.
 *
 * ### Lifecycle
 * The outbox row is written inside the same transaction that creates the
 * `Booking` row. The outbox worker drains the row to Kafka after commit.
 *
 * ### Versioning
 * Bump to V2 with a new schema and topic when the payload shape changes.
 */
export const HoldSeatsRequestedV1 = z.object({
  eventId: z.uuid(),
  bookingId: z.uuid(),
  scheduleId: z.uuid(),
  userId: z.uuid(),
  seatInventoryIds: z.array(z.uuid()).min(1).max(6),
  fromStaionId: z.uuid(),
  toStationId: z.uuid(),
  fromSequence: z.number().int().nonnegative(),
  toSequence: z.number().int().nonnegative(),
  holdTtlMs: z.number().int().positive(),
  createdAt: z.coerce.date(),
});

export type HoldSeatsRequestedV1Type = z.input<typeof HoldSeatsRequestedV1>;

import { moneyRupeesSchema } from "../money/index.js";

/**
 * Per-seat allocation row carried by {@link SeatsHeldV1}.
 */
export const SeatAllocationV1 = z.object({
  seatId: z.uuid(),
  seatInventoryId: z.uuid(),
  coachNumber: z.string().min(1),
  seatNumber: z.number().int().positive(),
  seatType: z.string().min(1),
  /** Price formatted as a canonical 2-decimal string in Rupees (e.g. "250.00"). */
  price: moneyRupeesSchema,
});

export type SeatAllocationV1Type = z.infer<typeof SeatAllocationV1>;

/**
 * ### Seats Held (success reply)
 *
 * Published by inventory-service when every requested seat was successfully
 * allocated. Consumed by booking-service's `seats-result` consumer, which
 * delegates to `BookingSagaOrchestrator.handleSeatsHeld` to advance the
 * booking from `PENDING` to `SEATS_HELD`.
 *
 * `holdExpiresAt` is the absolute timestamp at which the inventory-side
 * allocation will expire; the orchestrator uses it to renew the booking-side
 * Redis seat-lock TTL.
 */
export const SeatsHeldV1 = z.object({
  eventId: z.uuid(),
  bookingId: z.uuid(),
  allocations: z.array(SeatAllocationV1).min(1).max(6),
  holdExpiresAt: z.coerce.date(),
  createdAt: z.coerce.date(),
});

export type SeatsHeldV1Type = z.infer<typeof SeatsHeldV1>;

/**
 * Failure reasons carried by {@link SeatsHoldFailedV1}.
 */
export const SeatHoldFailureReason = {
  SEAT_ALREADY_HELD: "SEAT_ALREADY_HELD",
  SCHEDULE_NOT_FOUND: "SCHEDULE_NOT_FOUND",
  SEAT_NOT_FOUND: "SEAT_NOT_FOUND",
  SEGMENT_CONFLICT: "SEGMENT_CONFLICT",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type SeatHoldFailureReasonType =
  (typeof SeatHoldFailureReason)[keyof typeof SeatHoldFailureReason];

/**
 * ### Seats Hold Failed (failure reply)
 *
 * Published by inventory-service when one or more seats could not be
 * allocated. Consumed by booking-service's `seats-result` consumer, which
 * delegates to `BookingSagaOrchestrator.handleSeatsHoldFailed` to flip the
 * booking to `FAILED` and persist the failure reason.
 */
export const SeatsHoldFailedV1 = z.object({
  eventId: z.uuid(),
  bookingId: z.uuid(),
  reason: z.enum(SeatHoldFailureReason),
  message: z.string().min(1),
  failedSeatInventoryIds: z.array(z.uuid()).optional(),
  createdAt: z.coerce.date(),
});

export type SeatsHoldFailedV1Type = z.infer<typeof SeatsHoldFailedV1>;

/**
 * ## Seat Hold Expired (compensation)
 *
 * Published by inventory-service's `HoldExpiryWorker` when a held allocation
 * lapses before the booking reached `CONFIRMED`. Consumed by booking-service
 * which flips the booking to `EXPIRED` and marks the saga step
 * `COMPENSATED`.
 */
export const SeatHoldExpiredV1 = z.object({
  eventId: z.uuid(),
  bookingId: z.uuid(),
  expiredAt: z.coerce.date(),
  createdAt: z.coerce.date(),
});

export type SeatHoldExpiredV1Type = z.infer<typeof SeatHoldExpiredV1>;
