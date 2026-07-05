/**
 * List of nested field paths (dot-notation) that pino will redact in logs.
 * Field names and patterns in this list will have their values replaced with `[REDACTED]`.
 * Used to mask PII (passwords, tokens, email, payment details, etc.).
 */

export const REDACT_PATHS = [
  "email",
  "password",
  "confirmPassword",

  "token",
  "accessToken",
  "refreshToken",

  "authorization",
  "headers.authorization",

  "cookie",
  "headers.cookie",

  "otp",

  "cardNumber",
  "cvv",

  "upiPin",

  "secret",
  "apiKey",
  "clientSecret",

  "*.password",
  "*.token",
  "*.accessToken",
  "*.refreshToken",
];
