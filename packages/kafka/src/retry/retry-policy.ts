import type { KafkaJS } from "@confluentinc/kafka-javascript";

/**
 * Represents the retry parameters for Kafka client connection and message processing.
 *
 * Direct alias to `@confluentinc/kafka-javascript`'s native `KafkaJS.RetryOptions`.
 */
export type RetryPolicy = KafkaJS.RetryOptions;

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
   * Configured for transactional, critical background consumers (e.g. welcome notifications, inventory sync).
   * Spans a longer overall retry window to tolerate transient service or database recovery outages.
   * - Retries: 5 attempts
   * - Initial delay: 300ms
   * - Max delay: 30,000ms (30 seconds)
   *
   * @returns A pre-configured conservative {@link RetryPolicy}.
   */
  conservative: (): RetryPolicy => ({
    retries: 5,
    initialRetryTime: 300,
    maxRetryTime: 30_000,
  }),

  /**
   * Aggressive retry policy profile.
   *
   * Configured for non-critical or fast-recovery consumers (e.g. time-sensitive OTP SMS/email delivery).
   * Prefers rapid initial retries to achieve fast recovery before exhausting attempts.
   * - Retries: 8 attempts
   * - Initial delay: 100ms
   * - Max delay: 5,000ms (5 seconds)
   *
   * @returns A pre-configured aggressive {@link RetryPolicy}.
   */
  aggressive: (): RetryPolicy => ({
    retries: 8,
    initialRetryTime: 100,
    maxRetryTime: 5_000,
  }),

  /**
   * Generates a custom retry policy matching caller-specified parameters.
   *
   * Useful when environment-specific configurations do not align with standard profiles.
   *
   * @param params - Configuration object for custom retry limits.
   * @param params.retries - Maximum retry attempt count before failing.
   * @param params.initialRetryTime - Initial backoff delay in milliseconds.
   * @param params.maxRetryTime - Cap limit for any individual backoff delay in milliseconds.
   * @returns The generated custom {@link RetryPolicy}.
   */
  custom: (params: {
    retries: number;
    initialRetryTime: number;
    maxRetryTime: number;
  }): RetryPolicy => ({
    retries: params.retries,
    initialRetryTime: params.initialRetryTime,
    maxRetryTime: params.maxRetryTime,
  }),
} as const;
