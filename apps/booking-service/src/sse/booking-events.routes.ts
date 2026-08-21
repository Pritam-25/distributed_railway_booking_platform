/**
 * ## module/booking-events-routes
 *
 * Server-Sent Events sub-router for booking status streaming. Mounted
 * alongside the REST booking routes under `/bookings` — the same
 * gateway auth level (`"required"`) covers it. The path uses
 * `:bookingId/events` so it doesn't collide with `/bookings/:bookingId`
 * or `/bookings/:bookingId/cancel`.
 *
 * @packageDocumentation
 */

import { Router } from "express";

import {
  trustGatewayHeaders,
  asyncHandler,
  validateParams,
} from "@irctc/middleware";

import { bookingEventsController } from "@container";

import { bookingIdParamSchema } from "@dto";

/**
 * SSE booking-events routes.
 *
 * Mount under `/bookings` by `routes/index.ts`.
 */
const router: Router = Router();

router.use(trustGatewayHeaders);

router.get(
  "/:bookingId/events",
  validateParams(bookingIdParamSchema),
  asyncHandler((req, res) => bookingEventsController.stream(req, res)),
);

export { router as bookingEventsRoutes };
