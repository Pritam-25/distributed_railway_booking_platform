import { ERROR_CODES, type ErrorCode } from "./errorCodes.js";

export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  [ERROR_CODES.USER_ALREADY_EXISTS]: "User already exists.",
  [ERROR_CODES.INVALID_CREDENTIALS]: "Invalid credentials.",
  [ERROR_CODES.EMAIL_NOT_VERIFIED]: "Email not verified.",
  [ERROR_CODES.REFRESH_TOKEN_INVALID]: "Refresh token is invalid.",
  [ERROR_CODES.OTP_INVALID]: "The provided OTP is incorrect.",
  [ERROR_CODES.OTP_EXPIRED]: "The OTP has expired. Please request a new one.",
  [ERROR_CODES.OTP_LOCKED]:
    "Too many attempts. This OTP session has been locked.",
  [ERROR_CODES.OTP_SESSION_NOT_FOUND]:
    "OTP session not found. Please request a new OTP.",
  [ERROR_CODES.REGISTRATION_SESSION_EXPIRED]:
    "Your registration session has expired. Please start over.",
  [ERROR_CODES.SESSION_CONTEXT_MISSING]: "User session context is missing.",
  [ERROR_CODES.SESSION_EXPIRED_OR_REVOKED]:
    "Session has expired or been revoked.",
  [ERROR_CODES.ACCESS_TOKEN_MISSING]: "Access token is missing.",
  [ERROR_CODES.INVALID_TOKEN_TYPE]: "Invalid token type provided.",
  [ERROR_CODES.REFRESH_TOKEN_MISSING]: "Refresh token is missing.",
  [ERROR_CODES.SESSION_ID_REQUIRED]: "Session ID is required.",
  [ERROR_CODES.USER_NOT_FOUND]: "User not found.",
  [ERROR_CODES.INVALID_REFRESH_TOKEN]: "Invalid or expired refresh token.",
  [ERROR_CODES.SESSION_OWNERSHIP_INVALID]:
    "Cannot revoke another user's session.",
  [ERROR_CODES.DEVICE_FINGERPRINT_MISMATCH]:
    "Device mismatch detected. Please login again.",
  [ERROR_CODES.KAFKA_PUBLISH_FAILED]:
    "Failed to enqueue OTP delivery. Please try again.",
};
