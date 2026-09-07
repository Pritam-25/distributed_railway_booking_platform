import {
  type EachMessagePayload,
  type KafkaConsumerRunner,
} from "@irctc/kafka";
import type { logger as irctcLogger } from "@irctc/logger";
import type { Redis } from "@irctc/redis";
import {
  SeatAvailabilityChangedV1,
  type SeatAvailabilityChangedV1Type,
  KAFKA_TOPICS,
} from "@irctc/contracts";

/**
 * Public SSE payload streamed to the client for live seat map updates.
 */
export interface SeatAvailabilitySsePayload {
  eventId: string;
  scheduleId: string;
  seatId: string;
  status: "AVAILABLE" | "HELD" | "BOOKED";
  reason: "HELD" | "BOOKED" | "RELEASED" | "EXPIRED";
  fromSequence: number;
  toSequence: number;
  version: number;
  timestamp: string;
}

/**
 * Builds the Redis pub/sub channel name for a given schedule id.
 *
 * @param scheduleId - The schedule UUID.
 * @returns The channel name (e.g. `schedule:seat-events:5d2f...`).
 */
export function scheduleSeatEventsChannel(scheduleId: string): string {
  return `schedule:seat-events:${scheduleId}`;
}

/**
 * Kafka consumer component that consumes `SEAT_AVAILABILITY_CHANGED` events from Kafka
 * and publishes them to Redis Pub/Sub for SSE streaming.
 */
export class SeatEventBroadcaster {
  private readonly logger: typeof irctcLogger;

  /**
   * @param kafkaConsumer - Managed Kafka consumer runner.
   * @param redisPublisher - Redis publisher client.
   * @param loggerInstance - Pino logger instance.
   */
  constructor(
    private readonly kafkaConsumer: KafkaConsumerRunner,
    private readonly redisPublisher: Redis,
    loggerInstance: typeof irctcLogger,
  ) {
    this.logger = loggerInstance.child({ module: "seat-event-broadcaster" });
  }

  /**
   * Starts the Kafka consumer subscribing to `SEAT_AVAILABILITY_CHANGED`.
   */
  async start(): Promise<void> {
    await this.kafkaConsumer.run(
      KAFKA_TOPICS.SEAT_AVAILABILITY_CHANGED,
      async (payload: EachMessagePayload) => {
        await this.handleMessage(payload);
      },
    );

    this.logger.info(
      { topic: KAFKA_TOPICS.SEAT_AVAILABILITY_CHANGED },
      "SeatEventBroadcaster listening for seat availability changes",
    );
  }

  /**
   * Stops the Kafka consumer.
   */
  async stop(): Promise<void> {
    await this.kafkaConsumer.disconnect();
    this.logger.info("SeatEventBroadcaster stopped");
  }

  /**
   * Handles a Kafka message, validates `SeatAvailabilityChangedV1`,
   * transforms to `SeatAvailabilitySsePayload`, and publishes to Redis.
   */
  private async handleMessage(payload: EachMessagePayload): Promise<void> {
    const rawValue = payload.message.value?.toString();
    if (!rawValue) {
      this.logger.warn("Received empty Kafka message, skipping");
      return;
    }

    try {
      const parsedJson = JSON.parse(rawValue);
      const event: SeatAvailabilityChangedV1Type =
        SeatAvailabilityChangedV1.parse(parsedJson);

      const ssePayload: SeatAvailabilitySsePayload = {
        eventId: event.eventId,
        scheduleId: event.scheduleId,
        seatId: event.seatId,
        status: event.status,
        reason: event.reason,
        fromSequence: event.fromSequence,
        toSequence: event.toSequence,
        version: event.version,
        timestamp:
          typeof event.timestamp === "string"
            ? event.timestamp
            : (event.timestamp as Date).toISOString(),
      };

      const channel = scheduleSeatEventsChannel(event.scheduleId);
      await this.redisPublisher.publish(channel, JSON.stringify(ssePayload));

      this.logger.info(
        {
          eventId: event.eventId,
          scheduleId: event.scheduleId,
          seatId: event.seatId,
          channel,
        },
        "Published seat availability change to Redis Pub/Sub",
      );
    } catch (err) {
      this.logger.error(
        { err, rawValue },
        "Failed to parse or broadcast SEAT_AVAILABILITY_CHANGED message",
      );
    }
  }
}
