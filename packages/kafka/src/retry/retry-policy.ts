/**
 * Represents the retry parameters for Kafka consumer connection and message processing.
 *
 * Configures the number of allowed retries, start times, limits, and mathematical scaling factors.
 */
export interface RetryPolicy {
  /**
   * The maximum number of retry attempts.
   */
  retries: number;
  /**
   * The initial delay in milliseconds before the first retry attempt.
   */
  initialRetryTime: number;
  /**
   * The upper limit in milliseconds for any individual retry delay.
   */
  maxRetryTime: number;
  /**
   * The exponential backoff multiplication factor.
   */
  factor: number;
  /**
   * Optional custom multiplier factor.
   */
  multiplier?: number;
}

/**
 * Factory utilities for generating standardized retry policy configurations.
 *
 * Provides pre-configured profiles (conservative vs. aggressive) and custom builder methods
 * to ensure uniform retry structures across different service deployments.
 */
export const RetryPolicies = {
  /**
   * Conservative retry policy profile.
   *
   * Configured for transactional/critical consumers (e.g. notification, payment processing).
   * - Retries: 5
   * - Initial delay: 300ms
   * - Max delay: 30,000ms (30 seconds)
   * - Factor: 2
   *
   * @returns A pre-configured conservative RetryPolicy.
   */
  conservative: (): RetryPolicy => ({
    retries: 5,
    initialRetryTime: 300,
    maxRetryTime: 30_000,
    factor: 2,
  }),

  /**
   * Aggressive retry policy profile.
   *
   * Configured for non-critical, fast-recovery consumers.
   * - Retries: 8
   * - Initial delay: 100ms
   * - Max delay: 5,000ms (5 seconds)
   * - Factor: 2
   *
   * @returns A pre-configured aggressive RetryPolicy.
   */
  aggressive: (): RetryPolicy => ({
    retries: 8,
    initialRetryTime: 100,
    maxRetryTime: 5_000,
    factor: 2,
  }),

  /**
   * Generates a custom retry policy matching specific custom parameters.
   *
   * Useful when environment configurations do not conform to standardized profiles.
   *
   * @param params - Configuration arguments.
   * @param params.retries - Maximum retry count.
   * @param params.initialRetryTime - First delay in milliseconds.
   * @param params.maxRetryTime - Upper limit of any delay in milliseconds.
   * @param params.factor - Optional delay scaling multiplier (defaults to 2).
   * @returns The generated custom RetryPolicy.
   */
  custom: (params: {
    retries: number;
    initialRetryTime: number;
    maxRetryTime: number;
    factor?: number;
  }): RetryPolicy => ({
    retries: params.retries,
    initialRetryTime: params.initialRetryTime,
    maxRetryTime: params.maxRetryTime,
    factor: params.factor ?? 2,
  }),
} as const;
