// Service-specific keys for failures that aren't adequately named by
// COMMON_ERROR_CODES. Add a new entry here when a station-search-specific
// failure mode emerges (e.g. malformed cached payload that the deserialiser
// rejects). Editing the keys is a breaking change — keep them stable.
export const ERROR_CODES = {
  STATION_SEARCH_INTERNAL_ERROR: "STATION_SEARCH_INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

// Re-exported common codes so throwing sites can import from one barrel.
export { COMMON_ERROR_CODES, type CommonErrorCode } from "@irctc/errors";
