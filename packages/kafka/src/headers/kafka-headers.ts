/**
 * Single source of truth for Kafka header names used by producer and consumer services.
 *
 * Header keys follow kebab-case naming standards (`x-*`), matching HTTP/gRPC custom metadata conventions.
 */
export const KAFKA_HEADERS = {
  /** Unique UUID identifier of the business event (`x-event-id`). */
  EVENT_ID: "x-event-id",
  /** Domain type string of the event (`x-event-type`). */
  EVENT_TYPE: "x-event-type",
  /** Version number string of the payload schema (`x-schema-version`). */
  SCHEMA_VERSION: "x-schema-version",
  /** Diagnostic classification key of why the message was moved to the DLQ (`x-dlq-reason`). */
  DLQ_REASON: "x-dlq-reason",
  /** ISO 8601 timestamp string when the message was routed to the DLQ (`x-dlq-timestamp`). */
  DLQ_TIMESTAMP: "x-dlq-timestamp",
  /** Error message summary string leading to the DLQ dispatch (`x-dlq-error-message`). */
  DLQ_ERROR_MESSAGE: "x-dlq-error-message",
  /** Truncated error stack trace string (`x-dlq-error-stack`). */
  DLQ_ERROR_STACK: "x-dlq-error-stack",
  /** Name of the origin Kafka topic where processing failed (`x-original-topic`). */
  ORIGINAL_TOPIC: "x-original-topic",
  /** Partition index number string of the origin topic (`x-original-partition`). */
  ORIGINAL_PARTITION: "x-original-partition",
} as const;
