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
