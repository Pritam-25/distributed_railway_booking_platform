/**
 * Redis keys used by the authentication service.
 *
 * Each key uses a structured naming convention:
 * - `auth:session:{sessionId}` — Stores active device session data
 * - `auth:otp:{sessionId}` — Stores OTP verification data
 * - `auth:registration:{sessionId}` — Stores pre-registration data
 * - `auth:otp_rate:{email}` — Rate-limits OTP requests per email
 * - `auth:otp_attempts:{sessionId}` — Tracks OTP verification attempts
 * - `auth:user:{userId}:sessions` — Indexes active sessions per user
 */

export const REDIS_KEYS = {
  authSession: (sessionId: string) => `auth:session:${sessionId}`,
  otp: (sessionId: string) => `auth:otp:${sessionId}`,
  registrationSession: (sessionId: string) => `auth:registration:${sessionId}`,
  otpRate: (email: string) => `auth:otp_rate:${email}`,
  otpAttempts: (sessionId: string) => `auth:otp_attempts:${sessionId}`,
  userSessions: (userId: string) => `auth:user:${userId}:sessions`,
} as const;
