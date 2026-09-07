import type { Response } from "express";
import { logger } from "@irctc/logger";
import type { BookingStatusChangedV1Type } from "@irctc/contracts";

/**
 * Lightweight DTO serialized over the SSE stream to connected client browsers.
 */
export interface BookingStatusSsePayload {
  bookingId: string;
  currentStatus: string;
  version: number;
  updatedAt: string;
}

/**
 * ## BookingSseManager
 *
 * Process-local connection registry managing active HTTP SSE `Response` sockets
 * per `bookingId`. Dispatches real-time status notifications to matching sockets
 * and automatically prunes dead or destroyed streams.
 */
export class BookingSseManager {
  private readonly connections = new Map<string, Set<Response>>();

  /**
   * Registers an open SSE HTTP response socket for a given bookingId.
   *
   * @param bookingId - UUID of the booking to observe.
   * @param res - Open Express response stream.
   */
  register(bookingId: string, res: Response): void {
    let set = this.connections.get(bookingId);
    if (!set) {
      set = new Set();
      this.connections.set(bookingId, set);
    }
    set.add(res);
    logger.info(
      { module: "booking-sse-manager", bookingId, activeSockets: set.size },
      "Registered local SSE client socket",
    );
  }

  /**
   * Unregisters an SSE HTTP response socket for a given bookingId.
   *
   * @param bookingId - UUID of the booking.
   * @param res - Open Express response stream.
   */
  unregister(bookingId: string, res: Response): void {
    const set = this.connections.get(bookingId);
    if (!set) return;
    set.delete(res);
    if (set.size === 0) {
      this.connections.delete(bookingId);
    }
    logger.info(
      { module: "booking-sse-manager", bookingId, remainingSockets: set.size },
      "Unregistered local SSE client socket",
    );
  }

  /**
   * Dispatches a real-time `BookingStatusChangedV1` event to all open SSE connections
   * registered under `bookingId`.
   *
   * @param bookingId - UUID of the target booking.
   * @param event - Event payload received from Kafka or Redis Pub/Sub.
   */
  dispatch(bookingId: string, event: BookingStatusChangedV1Type): void {
    const set = this.connections.get(bookingId);
    if (!set || set.size === 0) {
      logger.debug(
        { module: "booking-sse-manager", bookingId },
        "No local SSE sockets registered for booking event dispatch",
      );
      return;
    }

    const payload: BookingStatusSsePayload = {
      bookingId: event.bookingId,
      currentStatus: event.currentStatus,
      version: event.version,
      updatedAt:
        typeof event.updatedAt === "string"
          ? event.updatedAt
          : (event.updatedAt as Date).toISOString(),
    };

    const sseMessage = `event: booking-status\ndata: ${JSON.stringify(payload)}\n\n`;

    const deadSockets: Response[] = [];

    for (const res of set) {
      try {
        if (res.writableEnded || res.destroyed) {
          deadSockets.push(res);
          continue;
        }
        res.write(sseMessage);
      } catch (err) {
        logger.warn(
          { module: "booking-sse-manager", bookingId, err },
          "Error writing to SSE socket, marking for pruning",
        );
        deadSockets.push(res);
      }
    }

    for (const dead of deadSockets) {
      this.unregister(bookingId, dead);
    }

    logger.info(
      {
        module: "booking-sse-manager",
        bookingId,
        dispatchedCount: set.size,
        prunedCount: deadSockets.length,
      },
      "Dispatched booking status SSE event to local client sockets",
    );
  }

  /**
   * Returns the count of active local SSE sockets for a given bookingId.
   */
  getSocketCount(bookingId: string): number {
    return this.connections.get(bookingId)?.size ?? 0;
  }
}
