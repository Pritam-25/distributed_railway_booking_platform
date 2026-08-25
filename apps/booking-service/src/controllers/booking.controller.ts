import type { Request, Response } from "express";
import { statusCode, successResponse } from "@irctc/http";

import { ApiError, COMMON_ERROR_CODES } from "@irctc/errors";
import { type BookingService } from "@services";
import {
  createBookingHeadersSchema,
  type BookingIdParamDto,
  type CreateBookingDto,
} from "@dto";

/**
 * ## BookingController
 *
 * HTTP adapter for booking endpoints. Validates `req.user` is present
 * (populated by `trustGatewayHeaders` at the route layer), delegates
 * to {@link BookingService}, and returns the project's standard
 * `successResponse` envelope.
 *
 * ### Error Handling
 * Never catches errors; they propagate to the global `errorHandler`
 * middleware. Service-layer throws `ApiError` with the right
 * `statusCode` + `code` for every failure mode.
 */
export class BookingController {
  /**
   * Creates an instance of BookingController.
   *
   * @param bookingService - Service that owns the booking-saga flow.
   */
  constructor(private readonly bookingService: BookingService) {}

  /**
   * `POST /api/v1/bookings`
   *
   * Creates a new booking in the `PENDING` state and returns the
   * generated booking id + PNR. Idempotent on `idempotencyKey`.
   *
   * @param req - Express request with a validated `CreateBookingDto`.
   * @param res - Express response returning the new booking summary.
   */
  async createBooking(req: Request, res: Response): Promise<void> {
    const userId = this.requireUserId(req);
    const body = req.body as CreateBookingDto;

    const { idempotencyKey } = createBookingHeadersSchema.parse({
      idempotencyKey: req.headers["idempotency-key"],
    });

    const result = await this.bookingService.createBooking(
      userId,
      body,
      idempotencyKey,
    );

    res
      .status(statusCode.created)
      .json(successResponse("Booking created successfully", result));
  }

  /**
   * `GET /api/v1/bookings/:bookingId`
   *
   * Returns the booking owned by the authenticated user.
   *
   * @param req - Express request with `req.params.bookingId`.
   * @param res - Express response returning the booking payload.
   */
  async getBooking(req: Request, res: Response): Promise<void> {
    const userId = this.requireUserId(req);
    const { bookingId } = req.params as unknown as BookingIdParamDto;

    const booking = await this.bookingService.findByIdForUser(
      userId,
      bookingId,
    );

    res
      .status(statusCode.success)
      .json(successResponse("Booking retrieved successfully", booking));
  }

  /**
   * `POST /api/v1/bookings/:bookingId/cancel`
   *
   * Initiates a user-driven cancellation. Flips the row through
   * `CANCELLING` → `CANCELLED` and emits one `BookingStatusChangedV1`
   * event per transition.
   *
   * @param req - Express request with `req.params.bookingId`.
   * @param res - Express response returning the cancelled booking.
   */
  async cancelBooking(req: Request, res: Response): Promise<void> {
    const userId = this.requireUserId(req);
    const { bookingId } = req.params as unknown as BookingIdParamDto;

    await this.bookingService.cancelBooking(bookingId, userId);
    const booking = await this.bookingService.findByIdForUser(
      userId,
      bookingId,
    );

    res
      .status(statusCode.success)
      .json(successResponse("Booking cancelled successfully", booking));
  }

  /**
   * `POST /api/v1/bookings/:bookingId/pay`
   *
   * Simulates successful payment for a booking at `SEATS_HELD` / `PAYMENT_PENDING`.
   * Drives the booking row through `CONFIRMING` → `CONFIRMED` and emits `BookingStatusChangedV1` events.
   *
   * @param req - Express request with `req.params.bookingId`.
   * @param res - Express response returning the confirmed booking.
   */
  async payBooking(req: Request, res: Response): Promise<void> {
    const userId = this.requireUserId(req);
    const { bookingId } = req.params as unknown as BookingIdParamDto;

    const paymentOrder = await this.bookingService.createPaymentOrder(
      bookingId,
      userId,
    );

    res
      .status(statusCode.success)
      .json(
        successResponse("Payment order created successfully", paymentOrder),
      );
  }

  /**
   * Throws `UNAUTHORIZED` when the gateway headers haven't populated
   * `req.user`. In practice this only fires when the request bypasses
   * the gateway (e.g. local curl in development) — the production
   * path always goes through `gatewayAuthMiddleware`.
   */
  private requireUserId(req: Request): string {
    const userId = req.user?.userId;
    if (!userId) {
      throw new ApiError(
        statusCode.unauthorized,
        COMMON_ERROR_CODES.UNAUTHORIZED,
        "Authentication required to access this booking endpoint.",
      );
    }
    return userId;
  }
}
