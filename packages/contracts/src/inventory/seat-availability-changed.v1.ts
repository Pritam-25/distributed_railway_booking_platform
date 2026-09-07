import { z } from "zod";

export enum SeatAvailabilityStatus {
  AVAILABLE = "AVAILABLE",
  HELD = "HELD",
  BOOKED = "BOOKED",
}

export enum SeatAvailabilityReason {
  HELD = "HELD",
  BOOKED = "BOOKED",
  RELEASED = "RELEASED",
  EXPIRED = "EXPIRED",
}

/**
 * ## Seat Availability Changed V1 Event
 *
 * Domain event emitted by `inventory-service` when a seat's allocation status
 * changes (`HELD`, `BOOKED`, `RELEASED`, `EXPIRED`). Consumed by `booking-service`
 * realtime broadcaster to update frontend seat maps via Redis Pub/Sub & SSE.
 */
export const SeatAvailabilityChangedV1 = z
  .object({
    eventId: z.uuid(),
    scheduleId: z.uuid(),
    seatId: z.string(),
    seatInventoryId: z.uuid(),
    status: z.enum(SeatAvailabilityStatus),
    reason: z.enum(SeatAvailabilityReason),
    fromSequence: z.number().int().nonnegative(),
    toSequence: z.number().int().positive(),
    bookingId: z.uuid().optional(),
    version: z.number().int().nonnegative(),
    timestamp: z.coerce.date(),
  })
  .refine((event) => event.fromSequence < event.toSequence, {
    message: "fromSequence must be less than toSequence",
    path: ["toSequence"],
  });

export type SeatAvailabilityChangedV1Type = z.infer<
  typeof SeatAvailabilityChangedV1
>;
