/**
 * Standardized reasons for routing messages to Dead Letter Queues.
 */
export const DLQ_REASONS = {
  /** The message payload failed validation against its defined schema (`schema_validation`). */
  SCHEMA_VALIDATION: "schema_validation",
  /** The message exceeded the maximum allowed retry attempts (`retry_exhausted`). */
  RETRY_EXHAUSTED: "retry_exhausted",
} as const;

/**
 * Union type representing valid Dead Letter Queue reason string values.
 */
export type DlqReason = (typeof DLQ_REASONS)[keyof typeof DLQ_REASONS];
