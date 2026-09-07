import type { Redis } from "@irctc/redis";
import type { BookingStatusChangedV1Type } from "@irctc/contracts";
import type { BookingSseManager } from "../connection-managers/booking-sse-manager.js";

/** Shared Redis channel name for cross-instance booking status notifications. */
export const BOOKING_STATUS_EVENTS_CHANNEL = "booking:status-events";

/**
 * Interface abstraction for publishing booking status events.
 * Decouples Kafka consumers from specific cross-instance IPC mechanisms.
 */
export interface BookingEventRouter {
  publish(event: BookingStatusChangedV1Type): Promise<void>;
}

/**
 * Process-local implementation of BookingEventRouter for single-instance setups.
 * Routes events directly to the local {@link BookingSseManager}.
 */
export class SingleInstanceBookingEventRouter implements BookingEventRouter {
  /**
   *
   */
  constructor(private readonly sseManager: BookingSseManager) {}

  /**
   *
   */
  async publish(event: BookingStatusChangedV1Type): Promise<void> {
    this.sseManager.dispatch(event.bookingId, event);
  }
}

/**
 * Distributed implementation of BookingEventRouter for multi-instance deployments.
 * Publishes events to the shared Redis Pub/Sub channel `booking:status-events`.
 */
export class DistributedBookingEventRouter implements BookingEventRouter {
  /**
   *
   */
  constructor(private readonly redisPublisher: Redis) {}

  /**
   *
   */
  async publish(event: BookingStatusChangedV1Type): Promise<void> {
    await this.redisPublisher.publish(
      BOOKING_STATUS_EVENTS_CHANNEL,
      JSON.stringify(event),
    );
  }
}
