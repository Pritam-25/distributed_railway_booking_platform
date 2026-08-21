import { Router } from "express";

import {
  trustGatewayHeaders,
  asyncHandler,
  validateParams,
  validateSchema,
} from "@irctc/middleware";

import { bookingController } from "@container";

import { bookingIdParamSchema, createBookingSchema } from "@dto";

/**
 * ## Booking Routes
 *
 * Sub-router mounted under `/bookings` by `routes/index.ts`. Trust
 * gateway-injected user headers (`X-User-Id`, `X-Session-Id`,
 * `X-User-Email`) so `req.user` is populated for the controller.
 *
 * @remarks
 * Public routes under this prefix would skip `trustGatewayHeaders`,
 * but every current endpoint requires an authenticated user, so the
 * middleware is mounted at the router level.
 */
const router: Router = Router();

router.use(trustGatewayHeaders);

router.post(
  "/",
  validateSchema(createBookingSchema),
  asyncHandler((req, res) => bookingController.createBooking(req, res)),
);

router.get(
  "/:bookingId",
  validateParams(bookingIdParamSchema),
  asyncHandler((req, res) => bookingController.getBooking(req, res)),
);

router.post(
  "/:bookingId/cancel",
  validateParams(bookingIdParamSchema),
  asyncHandler((req, res) => bookingController.cancelBooking(req, res)),
);

router.post(
  "/:bookingId/pay",
  validateParams(bookingIdParamSchema),
  asyncHandler((req, res) => bookingController.payBooking(req, res)),
);

export { router as bookingRoutes };
