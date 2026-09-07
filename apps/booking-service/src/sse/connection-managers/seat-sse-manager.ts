import type { Response } from "express";
import { logger } from "@irctc/logger";
import type { RedisSubscriptionManager } from "../pubsub/redis-subscription-manager.js";
import {
  scheduleSeatEventsChannel,
  type SeatAvailabilitySsePayload,
} from "../broadcasters/seat-event-broadcaster.js";

/**
 * ## SeatSseManager
 *
 * Process-local connection registry managing active HTTP SSE `Response` sockets
 * per `scheduleId` for public seatmap live updates.
 *
 * Uses `RedisSubscriptionManager` for dynamic reference-counted Pub/Sub channel subscriptions.
 */
export class SeatSseManager {
  private readonly connections = new Map<string, Set<Response>>();

  /**
   * @param subscriptionManager - Dynamic Redis channel subscription ref-counter.
   */
  constructor(private readonly subscriptionManager: RedisSubscriptionManager) {}

  /**
   * Registers an open SSE HTTP response socket for a schedule ID.
   *
   * @param scheduleId - UUID of the train schedule.
   * @param res - Open Express response stream.
   */
  async register(scheduleId: string, res: Response): Promise<void> {
    let set = this.connections.get(scheduleId);
    if (!set) {
      set = new Set();
      this.connections.set(scheduleId, set);
    }
    set.add(res);

    const channel = scheduleSeatEventsChannel(scheduleId);
    await this.subscriptionManager.ref(channel);

    logger.info(
      { module: "seat-sse-manager", scheduleId, activeSockets: set.size },
      "Registered local seatmap SSE client socket",
    );
  }

  /**
   * Unregisters an SSE HTTP response socket for a schedule ID.
   *
   * @param scheduleId - UUID of the train schedule.
   * @param res - Open Express response stream.
   */
  async unregister(scheduleId: string, res: Response): Promise<void> {
    const set = this.connections.get(scheduleId);
    if (!set) return;

    set.delete(res);
    if (set.size === 0) {
      this.connections.delete(scheduleId);
    }

    const channel = scheduleSeatEventsChannel(scheduleId);
    await this.subscriptionManager.unref(channel);

    logger.info(
      { module: "seat-sse-manager", scheduleId, remainingSockets: set.size },
      "Unregistered local seatmap SSE client socket",
    );
  }

  /**
   * Dispatches a seat availability change payload to all local SSE sockets registered for scheduleId.
   *
   * @param scheduleId - Target train schedule UUID.
   * @param payload - Public seat change SSE payload.
   */
  dispatch(scheduleId: string, payload: SeatAvailabilitySsePayload): void {
    const set = this.connections.get(scheduleId);
    if (!set || set.size === 0) return;

    const sseMessage = `event: seat-changed\ndata: ${JSON.stringify(payload)}\n\n`;
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
          { module: "seat-sse-manager", scheduleId, err },
          "Error writing to seatmap SSE socket, marking for pruning",
        );
        deadSockets.push(res);
      }
    }

    for (const dead of deadSockets) {
      void this.unregister(scheduleId, dead);
    }

    logger.info(
      {
        module: "seat-sse-manager",
        scheduleId,
        dispatchedCount: set.size,
        prunedCount: deadSockets.length,
      },
      "Dispatched seatmap SSE payload to local client sockets",
    );
  }

  /**
   * Returns active local socket count for a schedule ID.
   */
  getSocketCount(scheduleId: string): number {
    return this.connections.get(scheduleId)?.size ?? 0;
  }
}
