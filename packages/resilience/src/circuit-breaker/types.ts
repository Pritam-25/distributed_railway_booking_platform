import { z } from "zod";
import { LoggerLike } from "../rate-limiter/types.js";

/**
 * TypeScript interface representing configuration options for the CircuitBreaker.
 *  - name: The name of the circuit breaker
 *  - failureThreshold: Number of failures before opening the circuit (Default: 5).
 *  - successThreshold: Number of successes in HALF_OPEN state before closing the circuit (Default: 3).
 *  - recoveryTimeout: Time (in ms) to wait before attempting recovery (transition from OPEN to HALF_OPEN) (Default: 60000).
 *  - halfOpenMaxTrials: Maximum number of trials (requests allowed) in HALF_OPEN state (Default: 3).
 *  - timeoutMs: Timeout (in ms) for operations protected by the circuit breaker (Default: 5000).
 *  - onError: Callback triggered when execution fails with an error.
 *  - onSuccess: Callback triggered when execution succeeds.
 *  - onCircuitOpen: Callback triggered when the circuit transitions to OPEN.
 *  - onCircuitClosed: Callback triggered when the circuit transitions to CLOSED.
 *  - onCircuitHalfOpen: Callback triggered when the circuit transitions to HALF_OPEN.
 *  - onCircuitTimeout: Callback triggered when an execution times out.
 *  - onStateChange: Callback triggered when the circuit state changes.
 *  - logger: Optional structured logger implementation.
 */
export interface CircuitBreakerOptions {
  name: string;
  failureThreshold?: number;
  successThreshold?: number;
  recoveryTimeout?: number;
  halfOpenMaxTrials?: number;
  timeoutMs?: number;
  onError?: (error: Error, name?: string) => void;
  onSuccess?: (name?: string) => void;
  onCircuitOpen?: (name?: string) => void;
  onCircuitClosed?: (name?: string) => void;
  onCircuitHalfOpen?: (name?: string) => void;
  onCircuitTimeout?: (name?: string) => void;
  onStateChange?: (
    from: CircuitBreakerState,
    to: CircuitBreakerState,
    name?: string,
  ) => void;
  logger?: LoggerLike;
}

/**
 * Zod schema to validate CircuitBreakerOptions at runtime.
 */
export const CircuitBreakerOptionsSchema = z.object({
  name: z.string(),
  failureThreshold: z
    .number()
    .int()
    .positive("Failure threshold must be a positive integer")
    .optional(),
  successThreshold: z
    .number()
    .int()
    .positive("Success threshold must be a positive integer")
    .optional(),
  recoveryTimeout: z
    .number()
    .int()
    .positive("Recovery timeout must be a positive integer")
    .optional(),
  halfOpenMaxTrials: z
    .number()
    .int()
    .positive("Half open max trials must be a positive integer")
    .optional(),
  timeoutMs: z
    .number()
    .int()
    .positive("Timeout ms must be a positive integer")
    .optional(),
  onError: z.custom<(error: Error, name?: string) => void>().optional(),
  onSuccess: z.custom<(name?: string) => void>().optional(),
  onCircuitOpen: z.custom<(name?: string) => void>().optional(),
  onCircuitClosed: z.custom<(name?: string) => void>().optional(),
  onCircuitHalfOpen: z.custom<(name?: string) => void>().optional(),
  onCircuitTimeout: z.custom<(name?: string) => void>().optional(),
  onStateChange: z
    .custom<
      (
        from: CircuitBreakerState,
        to: CircuitBreakerState,
        name?: string,
      ) => void
    >()
    .optional(),
  logger: z.custom<LoggerLike>().optional(),
});

/**
 * Default circuit breaker options.
 */
export const DEFAULT_OPTIONS: CircuitBreakerOptions = {
  name: "default-circuit-breaker",
  failureThreshold: 5,
  successThreshold: 3,
  recoveryTimeout: 60000,
  halfOpenMaxTrials: 3,
  timeoutMs: 5000,
  onError: () => {},
  onSuccess: () => {},
  onCircuitOpen: () => {},
  onCircuitClosed: () => {},
  onCircuitHalfOpen: () => {},
  onCircuitTimeout: () => {},
  onStateChange: () => {},
};

/**
 * Possible states of the CircuitBreaker.
 */
export enum CircuitBreakerState {
  CLOSED = "CLOSED",
  OPEN = "OPEN",
  HALF_OPEN = "HALF_OPEN",
}

/**
 * Base class for all CircuitBreaker-related errors.
 */
export class CircuitBreakerError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "CircuitBreakerError";
  }
}

/**
 * Error thrown when an execution times out.
 */
export class CircuitBreakerTimeoutError extends CircuitBreakerError {
  constructor(options?: ErrorOptions) {
    super("Circuit breaker timeout", options);
    this.name = "CircuitBreakerTimeoutError";
  }
}

/**
 * Error thrown when trying to execute an operation and the circuit is OPEN.
 */
export class CircuitBreakerOpenError extends CircuitBreakerError {
  constructor(options?: ErrorOptions) {
    super("Circuit breaker is open", options);
    this.name = "CircuitBreakerOpenError";
  }
}

/**
 * Error thrown when trials capacity in HALF_OPEN state is exceeded.
 */
export class CircuitBreakerHalfOpenError extends CircuitBreakerError {
  constructor(options?: ErrorOptions) {
    super("Circuit breaker is half-open", options);
    this.name = "CircuitBreakerHalfOpenError";
  }
}
