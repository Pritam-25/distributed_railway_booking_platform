import { ERROR_CODES, type ErrorCode } from "./errorCodes.js";

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  [ERROR_CODES.INVALID_CREDENTIALS]: "Invalid email or password.",

  [ERROR_CODES.TRAIN_ALREADY_EXISTS]: "Train with this number already exists.",
  [ERROR_CODES.TRAIN_NOT_FOUND]: "Train not found.",
  [ERROR_CODES.TRAIN_NO_OPERATING_DAYS_CONFIGURED]:
    "Train has no operating days configured.",
  [ERROR_CODES.TRAIN_NOT_OPERATING_ON_DAY]:
    "Train does not operate on the scheduled day of the week.",
  [ERROR_CODES.TRAIN_OPERATING_DAYS_REFERENCED]:
    "Cannot remove operating days that have active future schedules.",

  [ERROR_CODES.COACH_ALREADY_EXISTS]:
    "Coach with this number already exists for this train.",
  [ERROR_CODES.COACH_NOT_FOUND]: "Coach not found.",
  [ERROR_CODES.SEATS_ALREADY_GENERATED]:
    "Seats have already been generated for this coach.",

  [ERROR_CODES.SEAT_NOT_FOUND]: "Seat not found.",
};
