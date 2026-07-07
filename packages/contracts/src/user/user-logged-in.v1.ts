import { z } from "zod";

/**
 * Published by user-service after a successful login and session write.
 * Consumed by notification-service to send a personalised "Welcome
 * back" email.
 *
 * The user has already authenticated by the time this event is emitted,
 * so publish failures are best-effort and must NOT roll back the
 * login — the consumer will not be able to send the email later either,
 * and the user experience is worse if a 5xx leaks out of /auth/login
 * because the notification queue is degraded.
 *
 * Versioning: bump to V2 with a new schema (and new topic) when the
 * payload shape changes. Consumers must use safeParse() and route
 * parse failures straight to the DLQ — never silently drop.
 *
 * Wire format: JSON. `loggedInAt` is published as a Date object; the
 * publisher's `JSON.stringify` converts it to an ISO 8601 string on
 * the wire. `z.coerce.date()` round-trips it back to a Date on the
 * consumer side, so the in-memory type is `Date` everywhere.
 */
export const UserLoggedInV1 = z.object({
  eventId: z.uuid(),
  userId: z.uuid(),
  email: z.email(),
  firstName: z.string(),
  loggedInAt: z.coerce.date(),
});

export type UserLoggedInV1Type = z.infer<typeof UserLoggedInV1>;
