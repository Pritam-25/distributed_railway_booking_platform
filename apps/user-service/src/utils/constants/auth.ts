export const AUTH_DURATIONS = {
  SESSION_TTL_SECONDS: 30 * 24 * 60 * 60, // 30 days
  SESSION_TTL_MS: 30 * 24 * 60 * 60 * 1000, // 30 days
  PASSWORD_RESET_TOKEN_TTL_SECONDS: 10 * 60, // 10 minutes
} as const;
