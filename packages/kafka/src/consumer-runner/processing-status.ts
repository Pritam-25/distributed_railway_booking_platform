export const PROCESSING_STATUS = {
  PROCESSED: "processed",
  DUPLICATE: "duplicate",
  INVALID: "invalid",
} as const;

export type ProcessingStatus =
  (typeof PROCESSING_STATUS)[keyof typeof PROCESSING_STATUS];
