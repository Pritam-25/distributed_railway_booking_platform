import { ERROR_CODES, type ErrorCode } from "./errorCodes.js";

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  // admin auth error messages
  [ERROR_CODES.INVALID_CREDENTIALS]: "Invalid email or password.",

  // train error messages
  [ERROR_CODES.TRAIN_ALREADY_EXISTS]: "Train with this number already exists.",
  [ERROR_CODES.TRAIN_NOT_FOUND]: "Train not found.",
  [ERROR_CODES.TRAIN_NO_OPERATING_DAYS_CONFIGURED]:
    "Train has no operating days configured.",
  [ERROR_CODES.TRAIN_NOT_OPERATING_ON_DAY]:
    "Train does not operate on the scheduled day of the week.",
  [ERROR_CODES.TRAIN_OPERATING_DAYS_REFERENCED]:
    "Cannot remove operating days that have active future schedules.",

  // coach error messages
  [ERROR_CODES.COACH_ALREADY_EXISTS]:
    "Coach with this number already exists for this train.",
  [ERROR_CODES.COACH_NOT_FOUND]: "Coach not found.",
  [ERROR_CODES.SEATS_ALREADY_GENERATED]:
    "Seats have already been generated for this coach.",

  // seat error messages
  [ERROR_CODES.SEAT_NOT_FOUND]: "Seat not found.",

  // station error messages
  [ERROR_CODES.STATION_ALREADY_EXISTS]:
    "Station with this code already exists.",
  [ERROR_CODES.STATION_NOT_FOUND]: "Station not found.",
  [ERROR_CODES.STATION_DEACTIVATED]: "Station is deactivated.",

  // Route error messages
  [ERROR_CODES.ROUTE_NOT_FOUND]: "Route not found.",
  [ERROR_CODES.ROUTE_ALREADY_EXISTS]:
    "Route with this train ID already exists.",
  [ERROR_CODES.ROUTE_REFERENCED_BY_SCHEDULES]:
    "Cannot delete route because it has active future schedules.",
  [ERROR_CODES.ROUTE_MIN_STATIONS_REQUIRED]:
    "Route must have at least 2 stations (source and destination).",
  [ERROR_CODES.ROUTE_STATION_NOT_FOUND]: "Route station not found.",
  [ERROR_CODES.STATION_ALREADY_ON_ROUTE]:
    "Station is already present on this route.",
  [ERROR_CODES.STOP_NUMBER_CONFLICT]:
    "Stop number conflicts with an existing stop on the route.",
};
