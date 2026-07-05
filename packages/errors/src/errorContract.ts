/**
 * Error contract for API response.
 * @param code Error code.
 * @param message Error message.
 * @param details Additional error details.
 */
export type ErrorContract = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};
