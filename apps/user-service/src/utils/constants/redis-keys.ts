export const REDIS_KEYS = {
  authSession: (sessionId: string) => `auth:session:${sessionId}`,
  otp: (sessionId: string) => `auth:otp:${sessionId}`,
  registrationSession: (sessionId: string) => `auth:registration:${sessionId}`,
  otpRate: (email: string) => `auth:otp_rate:${email}`,
  otpAttempts: (sessionId: string) => `auth:otp_attempts:${sessionId}`,
  userSessions: (userId: string) => `auth:user:${userId}:sessions`,
} as const;
