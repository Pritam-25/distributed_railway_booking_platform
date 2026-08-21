import { type ErrorCode } from "./errorCodes.js";

// `Record<ErrorCode, string>` mapping required by the global error registry.
// Add a new entry here in the same change as the corresponding code in
// errorCodes.ts — forgetting this file produces MISSING_ERROR_MESSAGE in the
// response, which is caught by check-types because the record is exhaustive.
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  STATION_SEARCH_INTERNAL_ERROR:
    "Station search could not complete the request.",
  STATION_NOT_FOUND:
    "Station could not be resolved. Verify the code or id and try again.",
  SCHEDULE_NOT_FOUND:
    "Schedule could not be found. Verify the scheduleId and try again.",
  SCHEDULE_INACTIVE:
    "Schedule is not active or the requested segment is invalid.",
  SEARCH_INDEX_UNAVAILABLE:
    "Train search index is temporarily unavailable. Please retry shortly.",
  SEARCH_INTERNAL_ERROR: "Train search could not complete the request.",
};
