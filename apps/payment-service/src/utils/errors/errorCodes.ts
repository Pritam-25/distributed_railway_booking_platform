export const ERROR_CODES = {
  SCHEDULE_INVENTORY_NOT_FOUND: "SCHEDULE_INVENTORY_NOT_FOUND",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
