import { ZodError } from "zod";

/**
 * Predicate determining whether a processing error represents a non-retryable message issue.
 *
 * Automatically treats {@link SyntaxError} (malformed JSON) and {@link ZodError}
 * (schema validation failures) as non-retryable poison messages.
 * Optional `isCustomNonRetryable` predicate permits consumers to classify domain-specific errors.
 *
 * @param err - Error instance caught during message handling.
 * @param isCustomNonRetryable - Optional domain-specific error evaluator callback.
 * @returns True if the message error should not be retried.
 */
export function isNonRetryableError(
  err: unknown,
  isCustomNonRetryable?: (err: unknown) => boolean,
): boolean {
  if (err instanceof SyntaxError || err instanceof ZodError) {
    return true;
  }
  return isCustomNonRetryable ? isCustomNonRetryable(err) : false;
}
