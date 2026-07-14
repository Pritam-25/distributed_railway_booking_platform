import { CircuitBreaker } from "./circuitBreaker.js";
import { CircuitBreakerOptions, CircuitBreakerState } from "./types.js";
import { LoggerLike } from "../rate-limiter/types.js";

/**
 * Registry to manage and reuse CircuitBreaker instances across the application.
 */
export class CircuitBreakerRegistry {
  private readonly breakers = new Map<string, CircuitBreaker>();
  private readonly logger?: LoggerLike;
  private readonly onStateChange?: (
    name: string,
    from: CircuitBreakerState,
    to: CircuitBreakerState,
  ) => void;

  constructor(options?: {
    logger?: LoggerLike;
    onStateChange?: (
      name: string,
      from: CircuitBreakerState,
      to: CircuitBreakerState,
    ) => void;
  }) {
    this.logger = options?.logger;
    this.onStateChange = options?.onStateChange;
  }

  /**
   * Retrieves an existing circuit breaker or creates a new one with the given options.
   *
   * @param name The name of the circuit breaker.
   * @param options Configuration options for the circuit breaker (excluding name).
   * @returns The registered or newly created CircuitBreaker instance.
   * @throws {Error} If the circuit breaker already exists and new options are provided.
   */
  public get(
    name: string,
    options?: Omit<CircuitBreakerOptions, "name">,
  ): CircuitBreaker {
    let breaker = this.breakers.get(name);
    if (!breaker) {
      breaker = new CircuitBreaker({
        logger: this.logger,
        ...options,
        name,
        onStateChange: (from, to) => {
          if (this.onStateChange) {
            this.onStateChange(name, from, to);
          }
          if (options?.onStateChange) {
            options.onStateChange(from, to, name);
          }
        },
      });
      this.breakers.set(name, breaker);
    } else if (options && Object.keys(options).length > 0) {
      throw new Error(
        `CircuitBreaker "${name}" already exists; options can only be set on first registration`,
      );
    }
    return breaker;
  }

  /**
   * Clears the registry. Mainly useful for tests.
   */
  public clear(): void {
    this.breakers.clear();
  }
}
