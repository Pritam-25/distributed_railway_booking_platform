/**
 * Reasons a message may be routed to a Dead Letter Queue (DLQ).
 *
 * Defining these reasons centrally ensures agreement on the wire format
 * between consumer services producing DLQ events and any automated DLQ replayers.
 */
export const DLQ_REASONS = {
  /**
   * The message payload failed validation against its defined schema.
   */
  SCHEMA_VALIDATION: "schema_validation",
  /**
   * The message exceeded the maximum allowed retry attempts.
   */
  RETRY_EXHAUSTED: "retry_exhausted",
} as const;

/**
 * Representation of possible reasons why a message was moved to a Dead Letter Queue.
 */
export type DlqReason = (typeof DLQ_REASONS)[keyof typeof DLQ_REASONS];
