/**
 * Cookie names used by the gateway and trusted by downstream services.
 *
 * Keep these in lockstep with the names the user-service issues when
 * calling `res.cookie(...)` in its auth controllers. Renaming here
 * without renaming there silently breaks login.
 */
export const COOKIE_NAMES = {
  /** Short-lived access token issued at login. */
  accessToken: "access_token",
  /** Separate token for admin-service sessions. */
  adminAccessToken: "admin_access_token",
} as const;
