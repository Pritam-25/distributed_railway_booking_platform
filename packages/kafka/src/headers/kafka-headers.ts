/**
 * Single source of truth for Kafka header names used by producer and consumer services.
 *
 * Defining these in a shared package ensures consistency in the wire format across microservices.
 * Header keys follow kebab-case standards, while reasons follow snake_case values.
 */
export const KAFKA_HEADERS = {
  /**
   * Unique identifier for the event.
   */
  EVENT_ID: "x-event-id",
  /**
   * The type of event (e.g., ticket_booked). Used for routing and dispatching.
   */
  EVENT_TYPE: "x-event-type",
  /**
   * Version of the event schema for message validation and backward compatibility.
   */
  SCHEMA_VERSION: "x-schema-version",
  /**
   * The classification of why the message was routed to the Dead Letter Queue.
   */
  DLQ_REASON: "x-dlq-reason",
  /**
   * The ISO 8601 timestamp recording when the message was written to the DLQ.
   */
  DLQ_TIMESTAMP: "x-dlq-timestamp",
  /**
   * The text description of the error that caused message processing to fail.
   */
  DLQ_ERROR_MESSAGE: "x-dlq-error-message",
  /**
   * The stack trace (typically truncated) associated with the message processing failure.
   */
  DLQ_ERROR_STACK: "x-dlq-error-stack",
  /**
   * The name of the original Kafka topic where the message failed to process.
   */
  ORIGINAL_TOPIC: "x-original-topic",
  /**
   * The partition of the original Kafka topic where the message failed to process.
   */
  ORIGINAL_PARTITION: "x-original-partition",
} as const;
