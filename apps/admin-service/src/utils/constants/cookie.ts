import { env } from "@config";

export const COOKIE_NAMES = {
  ACCESS_TOKEN: "auth_token",
  REFRESH_TOKEN: "refresh_token",
  OTP_SESSION: "otp_session",
} as const;

const DURATION_TO_MS = {
  "15m": 15 * 60 * 1000,
  "30m": 30 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
} as const;

export const COOKIE_MAX_AGE = {
  ACCESS_TOKEN:
    DURATION_TO_MS[env.JWT_ACCESS_EXPIRES_IN as keyof typeof DURATION_TO_MS],
  REFRESH_TOKEN:
    DURATION_TO_MS[env.JWT_REFRESH_EXPIRES_IN as keyof typeof DURATION_TO_MS],
} as const;
