import { type ErrorCode } from "./errorCodes.js";

// `Record<ErrorCode, string>` mapping required by the global error registry.
// Add a new entry here in the same change as the corresponding code in
// errorCodes.ts — forgetting this file produces MISSING_ERROR_MESSAGE in the
// response, which is caught by check-types because the record is exhaustive.
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  STATION_SEARCH_INTERNAL_ERROR:
    "Station search could not complete the request.",
};
