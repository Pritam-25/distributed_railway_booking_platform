/**
 * ## module/booking-events-controller
 *
 * SSE adapter for booking-status streaming. Authenticates the
 * requesting user, verifies booking ownership, then opens a
 * long-lived HTTP response that forwards every `BookingStatusChangedV1`
 * event from the Redis pub/sub channel `booking:status:<bookingId>` to
 * the connected browser.
 *
 * ### Wire format
 * ```
 * event: connected
 * data: {"bookingId":"<uuid>"}
 *
 * event: booking.status_changed
 * data: {"eventId":"...","bookingId":"...","pnr":"...","userId":"...","previousStatus":null,"currentStatus":"PENDING","version":1,"updatedAt":"2026-08-14T..."}
 *
 * : keepalive
 *
 * ```
 *
 * @packageDocumentation
 */

import type { Request, Response } from "express";
import { ApiError, COMMON_ERROR_CODES } from "@irctc/errors";
import { statusCode } from "@irctc/http";
import { logger } from "@irctc/logger";
import type { Redis } from "@irctc/redis";

import type { BookingRepository } from "@repository";
import { ERROR_CODES } from "@utils/errors";

import { bookingStatusChannel } from "./booking-event-broadcaster.js";

/** Heartbeat cadence — keeps the connection alive through nginx + corporate proxies. */
const HEARTBEAT_INTERVAL_MS = 30_000;

/**
 * Controller exposing the SSE booking-status stream.
 *
 * ### Responsibilities
 * - Verify the booking exists and is owned by the authenticated user.
 * - Open a `text/event-stream` response.
 * - Forward every Redis pub/sub message on `booking:status:<bookingId>`.
 * - Emit periodic `: keepalive` comments to defeat intermediate timeouts.
 * - Clean up the subscriber on `req.close` / `req.error`.
 */
export class BookingEventsController {
  /**
   * Creates an instance of BookingEventsController.
   *
   * @param bookingRepository - Booking aggregate repository (used for ownership check).
   * @param createSubscriber - Factory that returns a fresh `ioredis`
   *   connection dedicated to pub/sub subscription. `ioredis` blocks
   *   the primary client connection while in subscribe mode, so a
   *   duplicated connection per browser tab is mandatory.
   */
  constructor(
    private readonly bookingRepository: BookingRepository,
    private readonly createSubscriber: () => Redis,
  ) {}

  /**
   * Streams `BookingStatusChangedV1` events for a booking owned by
   * the authenticated user.
   *
   * @param req - Express request. `req.user.userId` must be present
   *   (set by `trustGatewayHeaders`); `req.params.bookingId` is the
   *   UUID of the booking to subscribe to.
   * @param res - Express response. Detected as the SSE response by
   *   the gateway's auth middleware which does not buffer the body.
   */
  async stream(req: Request, res: Response): Promise<void> {
    const { bookingId } = req.params as { bookingId: string };
    const userId = req.user?.userId;
    if (!userId) {
      throw new ApiError(
        statusCode.unauthorized,
        COMMON_ERROR_CODES.UNAUTHORIZED,
        "Authentication required to subscribe to booking events.",
      );
    }

    // 1. Verify the booking exists and belongs to this user.
    const booking = await this.bookingRepository.findById(bookingId);
    if (!booking) {
      throw new ApiError(
        statusCode.notFound,
        ERROR_CODES.BOOKING_NOT_FOUND,
        `Booking not found for bookingId=${bookingId}.`,
      );
    }
    if (booking.userId !== userId) {
      throw new ApiError(
        statusCode.forbidden,
        ERROR_CODES.BOOKING_FORBIDDEN,
        `Booking ${bookingId} does not belong to this user.`,
      );
    }

    // 2. Open the SSE response. Headers must be flushed BEFORE the
    //    first write so the gateway / nginx proxy stops buffering.
    res.status(statusCode.success);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // disable nginx buffering
    res.flushHeaders();

    // 3. Initial heartbeat so the browser's EventSource flips to OPEN
    //    immediately even if no events arrive for a while.
    res.write(`event: connected\ndata: ${JSON.stringify({ bookingId })}\n\n`);

    // 4. Subscribe to the per-booking Redis channel on a fresh
    //    connection. `ioredis` blocks the primary connection while in
    //    subscribe mode, so a separate connection per tab is required.
    const subscriber = this.createSubscriber();
    const channel = bookingStatusChannel(bookingId);
    await subscriber.subscribe(channel);

    const onMessage = (chan: string, message: string): void => {
      if (chan !== channel) return;
      // `res.write` may throw if the response has already been closed
      // (client navigated away). Catch and log; cleanup runs via `req.close`.
      try {
        res.write(`event: booking.status_changed\ndata: ${message}\n\n`);
      } catch (err) {
        logger.warn(
          { module: "booking-events-controller", bookingId, err },
          "Failed to write SSE event; client likely disconnected.",
        );
      }
    };
    subscriber.on("message", onMessage);

    // 5. Periodic keepalive — `: keepalive\n\n` is an SSE comment line
    //    that the browser ignores but proxies use to keep the socket open.
    const heartbeat = setInterval(() => {
      try {
        res.write(`: keepalive\n\n`);
      } catch {
        // Response is already closed; the req.close handler will clean up.
      }
    }, HEARTBEAT_INTERVAL_MS);
    heartbeat.unref?.();

    // 6. Cleanup on disconnect. Both `close` and `error` events fire on
    //    client navigation / network failure; idempotent because the
    //    handler detaches itself.
    let cleaned = false;
    const cleanup = async (): Promise<void> => {
      if (cleaned) return;
      cleaned = true;
      clearInterval(heartbeat);
      subscriber.off("message", onMessage);
      try {
        await subscriber.unsubscribe(channel);
      } catch {
        // Best-effort: if Redis is down the disconnect() below still
        // tears down the local connection.
      }
      subscriber.disconnect();
      logger.info(
        { module: "booking-events-controller", bookingId, userId },
        "SSE booking-events stream closed",
      );
    };

    req.on("close", () => {
      void cleanup();
    });
    req.on("error", () => {
      void cleanup();
    });
  }
}
