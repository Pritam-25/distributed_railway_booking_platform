import {
  OpenAPIRegistry,
  SuccessResponseSchema,
  createErrorResponseSchema,
  createOpenApiResponse,
  CommonErrorResponses,
  GatewayAuthSecurity,
} from "@irctc/openapi";
import { COMMON_ERROR_CODES, COMMON_ERROR_MESSAGES } from "@irctc/errors";
import { ERROR_CODES, ERROR_MESSAGES } from "@utils/errors";

import {
  bookingIdParamSchema,
  createBookingResponseSchema,
  createBookingSchema,
} from "@dto";
import { bookingServiceOpenApiDescriptions } from "./descriptions.js";

/**
 * ## Booking Service — OpenAPI Registry
 *
 * Single source of truth for the booking-service contract. Consumed by
 * `generate-spec.ts` at build time to emit `apps/booking-service/openapi.yaml`,
 * which the api-gateway merges into the unified public contract via
 * `redocly join`.
 */
export const registry = new OpenAPIRegistry();

// ─── Booking Endpoints ───────────────────────────────────────────────────────

/**
 * `POST /api/v1/bookings`
 *
 * Creates a new booking in the `PENDING` state. Idempotent on
 * `idempotencyKey`. Authenticated via Bearer JWT or `access_token` cookie.
 */
registry.registerPath({
  method: "post",
  path: "/api/v1/bookings",
  operationId: "bookingsCreateBooking",
  tags: ["Bookings"],
  summary: bookingServiceOpenApiDescriptions.bookings.createBooking.summary,
  description:
    bookingServiceOpenApiDescriptions.bookings.createBooking.description,
  security: GatewayAuthSecurity,
  request: {
    body: {
      content: {
        "application/json": {
          schema: createBookingSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    201: createOpenApiResponse(
      "Booking created successfully",
      SuccessResponseSchema(
        createBookingResponseSchema,
        "Booking created successfully",
      ),
    ),
    ...CommonErrorResponses,
    401: createOpenApiResponse(
      "Unauthorized - JWT is missing or invalid",
      createErrorResponseSchema(
        COMMON_ERROR_CODES.UNAUTHORIZED,
        COMMON_ERROR_MESSAGES.UNAUTHORIZED,
      ),
    ),
    404: createOpenApiResponse(
      "Not Found - The schedule or one of the seats does not exist",
      createErrorResponseSchema(
        ERROR_CODES.BOOKING_NOT_FOUND,
        ERROR_MESSAGES[ERROR_CODES.BOOKING_NOT_FOUND],
      ),
    ),
    409: createOpenApiResponse(
      "Conflict - Seats are already held, or the saga cannot proceed",
      createErrorResponseSchema(
        ERROR_CODES.BOOKING_INVALID_TRANSITION,
        ERROR_MESSAGES[ERROR_CODES.BOOKING_INVALID_TRANSITION],
      ),
    ),
  },
});

/**
 * `GET /api/v1/bookings/:bookingId`
 *
 * Returns the booking owned by the authenticated user.
 */
registry.registerPath({
  method: "get",
  path: "/api/v1/bookings/{bookingId}",
  operationId: "bookingsGetBooking",
  tags: ["Bookings"],
  summary: bookingServiceOpenApiDescriptions.bookings.getBooking.summary,
  description:
    bookingServiceOpenApiDescriptions.bookings.getBooking.description,
  security: GatewayAuthSecurity,
  request: {
    params: bookingIdParamSchema,
  },
  responses: {
    200: createOpenApiResponse(
      "Booking retrieved successfully",
      SuccessResponseSchema(
        createBookingResponseSchema,
        "Booking retrieved successfully",
      ),
    ),
    ...CommonErrorResponses,
    401: createOpenApiResponse(
      "Unauthorized - JWT is missing or invalid",
      createErrorResponseSchema(
        COMMON_ERROR_CODES.UNAUTHORIZED,
        COMMON_ERROR_MESSAGES.UNAUTHORIZED,
      ),
    ),
    403: createOpenApiResponse(
      "Forbidden - Booking is owned by another user",
      createErrorResponseSchema(
        ERROR_CODES.BOOKING_FORBIDDEN,
        ERROR_MESSAGES[ERROR_CODES.BOOKING_FORBIDDEN],
      ),
    ),
    404: createOpenApiResponse(
      "Not Found - Booking does not exist",
      createErrorResponseSchema(
        ERROR_CODES.BOOKING_NOT_FOUND,
        ERROR_MESSAGES[ERROR_CODES.BOOKING_NOT_FOUND],
      ),
    ),
  },
});

/**
 * `POST /api/v1/bookings/:bookingId/cancel`
 *
 * Cancels a booking owned by the authenticated user. Drives the row
 * through `CANCELLING → CANCELLED` and emits one
 * `BookingStatusChangedV1` event per transition.
 */
registry.registerPath({
  method: "post",
  path: "/api/v1/bookings/{bookingId}/cancel",
  operationId: "bookingsCancelBooking",
  tags: ["Bookings"],
  summary: bookingServiceOpenApiDescriptions.bookings.cancelBooking.summary,
  description:
    bookingServiceOpenApiDescriptions.bookings.cancelBooking.description,
  security: GatewayAuthSecurity,
  request: {
    params: bookingIdParamSchema,
  },
  responses: {
    200: createOpenApiResponse(
      "Booking cancelled successfully",
      SuccessResponseSchema(
        createBookingResponseSchema,
        "Booking cancelled successfully",
      ),
    ),
    ...CommonErrorResponses,
    401: createOpenApiResponse(
      "Unauthorized - JWT is missing or invalid",
      createErrorResponseSchema(
        COMMON_ERROR_CODES.UNAUTHORIZED,
        COMMON_ERROR_MESSAGES.UNAUTHORIZED,
      ),
    ),
    403: createOpenApiResponse(
      "Forbidden - Booking is owned by another user",
      createErrorResponseSchema(
        ERROR_CODES.BOOKING_FORBIDDEN,
        ERROR_MESSAGES[ERROR_CODES.BOOKING_FORBIDDEN],
      ),
    ),
    404: createOpenApiResponse(
      "Not Found - Booking does not exist",
      createErrorResponseSchema(
        ERROR_CODES.BOOKING_NOT_FOUND,
        ERROR_MESSAGES[ERROR_CODES.BOOKING_NOT_FOUND],
      ),
    ),
    409: createOpenApiResponse(
      "Conflict - Booking is in a terminal state and cannot be cancelled",
      createErrorResponseSchema(
        ERROR_CODES.BOOKING_INVALID_TRANSITION,
        ERROR_MESSAGES[ERROR_CODES.BOOKING_INVALID_TRANSITION],
      ),
    ),
  },
});
