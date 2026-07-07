import { z } from "zod";

/**
 * Published by user-service after it has stored an OTP in Redis.
 * Consumed by notification-service to send the OTP via email.
 *
 * Versioning: bump to V2 with a new schema (and new topic) when the
 * payload shape changes. Consumers must use safeParse() and route
 * parse failures straight to the DLQ — never silently drop.
 *
 * Wire format: JSON. `createdAt` is published as a Date object; the
 * publisher's `JSON.stringify` converts it to an ISO 8601 string on
 * the wire. `z.coerce.date()` round-trips it back to a Date on the
 * consumer side, so the in-memory type is `Date` everywhere.
 */
export const OTPRequestedV1 = z.object({
  eventId: z.uuid(),
  userId: z.uuid().optional(),
  email: z.email(),
  otp: z.string().length(6),
  createdAt: z.coerce.date(),
});

export type OTPRequestedV1Type = z.infer<typeof OTPRequestedV1>;
