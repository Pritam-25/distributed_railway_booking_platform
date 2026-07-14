/**
 * Per-upstream circuit-breaker timeout table.
 *
 * Each upstream's `circuitName` maps to a timeout (ms) used by the
 * `CircuitBreakerRegistry` when the breaker is first registered.
 * Once registered, options are immutable — to change a timeout you
 * must restart the process.
 *
 * Defaults to 5s for any upstream not listed here. Tune based on
 * observed p99 latency for that service.
 */
export const TIMEOUTS: Record<string, number> = {
  "user-service": 5000,
  "notification-service": 5000,
};

export const DEFAULT_TIMEOUT_MS = 5000;
