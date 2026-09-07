import type { Redis } from "@irctc/redis";
import { logger } from "@irctc/logger";
import {
  BookingStatusChangedV1,
  type BookingStatusChangedV1Type,
} from "@irctc/contracts";
import type { BookingSseManager } from "../connection-managers/booking-sse-manager.js";
import type { SeatSseManager } from "../connection-managers/seat-sse-manager.js";
import type { SeatAvailabilitySsePayload } from "./seat-event-broadcaster.js";

/** Fixed shared channel for private booking status updates across all service instances. */
export const BOOKING_STATUS_EVENTS_CHANNEL = "booking:status-events";

/** Dynamic channel prefix for schedule seatmap updates. */
export const SCHEDULE_SEAT_EVENTS_PREFIX = "schedule:seat-events:";

/**
 * ## RealtimeEventRouter
 *
 * Dedicated router attached to the shared service `redisSubscriber` connection.
 * Listens to incoming Redis Pub/Sub messages on both fixed (`booking:status-events`)
 * and dynamic (`schedule:seat-events:<scheduleId>`) channels, deserializes payloads,
 * and routes events directly to the corresponding domain SSE manager.
 */
export class RealtimeEventRouter {
  private readonly logger: typeof logger;
  private messageHandler: ((channel: string, message: string) => void) | null =
    null;

  /**
   * @param redisSubscriber - Shared service subscriber Redis client (`redisSubscriber`).
   * @param bookingSseManager - Process-local connection registry for booking streams.
   * @param seatSseManager - Process-local connection registry for seatmap streams.
   */
  constructor(
    private readonly redisSubscriber: Redis,
    private readonly bookingSseManager: BookingSseManager,
    private readonly seatSseManager: SeatSseManager,
  ) {
    this.logger = logger.child({ module: "realtime-event-router" });
  }

  /**
   * Subscribes to the fixed `booking:status-events` channel and attaches the Pub/Sub message listener.
   */
  async start(): Promise<void> {
    await this.redisSubscriber.subscribe(BOOKING_STATUS_EVENTS_CHANNEL);

    this.messageHandler = (channel: string, message: string) => {
      this.handleRedisMessage(channel, message);
    };

    this.redisSubscriber.on("message", this.messageHandler);

    this.logger.info(
      { channel: BOOKING_STATUS_EVENTS_CHANNEL },
      "RealtimeEventRouter started and listening on Redis subscriber socket",
    );
  }

  /**
   * Detaches the Pub/Sub message listener.
   */
  async stop(): Promise<void> {
    if (this.messageHandler) {
      this.redisSubscriber.removeListener("message", this.messageHandler);
      this.messageHandler = null;
    }
    this.logger.info("RealtimeEventRouter stopped listener");
  }

  /**
   * Handles incoming Redis Pub/Sub messages and dispatches to appropriate SSE connection manager.
   */
  private handleRedisMessage(channel: string, message: string): void {
    if (channel === BOOKING_STATUS_EVENTS_CHANNEL) {
      this.handleBookingStatusEvent(message);
      return;
    }

    if (channel.startsWith(SCHEDULE_SEAT_EVENTS_PREFIX)) {
      const scheduleId = channel.slice(SCHEDULE_SEAT_EVENTS_PREFIX.length);
      this.handleSeatAvailabilityEvent(scheduleId, message);
    }
  }

  /**
   * Deserializes and dispatches `BookingStatusChangedV1` events to local `BookingSseManager`.
   */
  private handleBookingStatusEvent(message: string): void {
    try {
      const parsedJson = JSON.parse(message);
      const event: BookingStatusChangedV1Type =
        BookingStatusChangedV1.parse(parsedJson);

      this.bookingSseManager.dispatch(event.bookingId, event);
    } catch (err) {
      this.logger.error(
        { err, message },
        "Failed to parse or route Redis booking:status-events message",
      );
    }
  }

  /**
   * Deserializes and dispatches seatmap events to local `SeatSseManager`.
   */
  private handleSeatAvailabilityEvent(
    scheduleId: string,
    message: string,
  ): void {
    try {
      const payload = JSON.parse(message) as SeatAvailabilitySsePayload;
      if (!payload.seatId || !payload.scheduleId) {
        this.logger.warn(
          { scheduleId, message },
          "Malformed seat availability SSE payload",
        );
        return;
      }
      this.seatSseManager.dispatch(scheduleId, payload);
    } catch (err) {
      this.logger.error(
        { err, scheduleId, message },
        "Failed to parse or route Redis schedule seat event message",
      );
    }
  }
}
