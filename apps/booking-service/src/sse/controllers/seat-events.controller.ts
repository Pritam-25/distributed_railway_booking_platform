import type { Request, Response } from "express";
import { statusCode } from "@irctc/http";
import { logger } from "@irctc/logger";
import type { SeatSseManager } from "../connection-managers/seat-sse-manager.js";

/** Heartbeat cadence — keeps the connection alive through nginx proxies. */
const HEARTBEAT_INTERVAL_MS = 30_000;

/**
 * Controller exposing real-time seat availability SSE events for a schedule.
 *
 * ### Responsibilities
 * - Open a `text/event-stream` response for `GET /api/v1/schedules/:scheduleId/seat-events`.
 * - Register socket with {@link SeatSseManager} (which manages dynamic Redis channel subscriptions).
 * - Emit periodic `: keepalive` comments to defeat intermediate proxy timeouts.
 * - Clean up registration on `req.close` / `req.error`.
 */
export class SeatEventsController {
  /**
   * @param seatSseManager - Domain connection registry managing seatmap streams per schedule.
   */
  constructor(private readonly seatSseManager: SeatSseManager) {}

  /**
   * Streams `SeatAvailabilityChangedV1` events for a train schedule.
   *
   * @param req - Express request. `req.params.scheduleId` is the schedule UUID.
   * @param res - Express response stream.
   */
  async stream(req: Request, res: Response): Promise<void> {
    const { scheduleId } = req.params as { scheduleId: string };

    res.status(statusCode.success);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    res.write(`event: connected\ndata: ${JSON.stringify({ scheduleId })}\n\n`);

    await this.seatSseManager.register(scheduleId, res);

    logger.info(
      { module: "seat-events-controller", scheduleId },
      "SSE seat-events stream opened",
    );

    let cleaned = false;

    const heartbeat = setInterval(() => {
      try {
        if (res.writableEnded || res.destroyed) {
          void cleanup();
          return;
        }
        res.write(`: keepalive\n\n`);
      } catch {
        void cleanup();
      }
    }, HEARTBEAT_INTERVAL_MS);
    heartbeat.unref?.();

    const cleanup = async (): Promise<void> => {
      if (cleaned) return;
      cleaned = true;
      clearInterval(heartbeat);
      await this.seatSseManager.unregister(scheduleId, res);
      logger.info(
        { module: "seat-events-controller", scheduleId },
        "SSE seat-events stream closed",
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
