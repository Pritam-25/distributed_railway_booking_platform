/**
 * Custom error class for API errors
 * @param statusCode HTTP status code.
 * @param code Error code.
 * @param message Error message.
 * @param details Additional error details.
 */
export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(
    statusCode: number,
    code: string,
    message?: string,
    details?: unknown,
  ) {
    super(message ?? code);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}
