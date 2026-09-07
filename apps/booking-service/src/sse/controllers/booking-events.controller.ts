import type { Request, Response } from "express";
import { ApiError, COMMON_ERROR_CODES } from "@irctc/errors";
import { statusCode } from "@irctc/http";
import { logger } from "@irctc/logger";

import type { BookingRepository } from "@repository";
import { ERROR_CODES } from "@utils/errors";

import type { BookingSseManager } from "../connection-managers/booking-sse-manager.js";

/** Heartbeat cadence — keeps the connection alive through nginx + corporate proxies. */
const HEARTBEAT_INTERVAL_MS = 30_000;

/**
 * Controller exposing the SSE booking-status stream.
 *
 * ### Responsibilities
 * - Verify the booking exists and is owned by the authenticated user.
 * - Open a `text/event-stream` response.
 * - Register socket with {@link BookingSseManager} for real-time invalidation signals.
 * - Emit periodic `: keepalive` comments to defeat intermediate timeouts.
 * - Clean up local registration on `req.close` / `req.error`.
 */
export class BookingEventsController {
  /**
   * Creates an instance of BookingEventsController.
   *
   * @param bookingRepository - Booking aggregate repository (used for ownership check).
   * @param sseManager - Connection registry managing local SSE sockets.
   */
  constructor(
    private readonly bookingRepository: BookingRepository,
    private readonly sseManager: BookingSseManager,
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

    // 4. Register connection with process-local SSE manager.
    this.sseManager.register(bookingId, res);
    logger.info(
      { module: "booking-events-controller", bookingId, userId },
      "SSE booking-events stream opened",
    );

    let cleaned = false;

    // 5. Periodic keepalive — `: keepalive\n\n` is an SSE comment line
    //    that the browser ignores but proxies use to keep the socket open.
    const heartbeat = setInterval(() => {
      try {
        if (res.writableEnded || res.destroyed) {
          cleanup();
          return;
        }
        res.write(`: keepalive\n\n`);
      } catch {
        cleanup();
      }
    }, HEARTBEAT_INTERVAL_MS);
    heartbeat.unref?.();

    // 6. Cleanup on disconnect. Both `close` and `error` events fire on
    //    client navigation / network failure.
    const cleanup = (): void => {
      if (cleaned) return;
      cleaned = true;
      clearInterval(heartbeat);
      this.sseManager.unregister(bookingId, res);
      logger.info(
        { module: "booking-events-controller", bookingId, userId },
        "SSE booking-events stream closed",
      );
    };

    req.on("close", cleanup);
    req.on("error", cleanup);
  }
}
