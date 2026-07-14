import {
  CircuitBreakerOptions,
  CircuitBreakerState,
  CircuitBreakerOpenError,
  CircuitBreakerHalfOpenError,
  CircuitBreakerTimeoutError,
  CircuitBreakerOptionsSchema,
  DEFAULT_OPTIONS,
} from "./types.js";

/**
 * A Circuit Breaker resilience pattern implementation.
 * Wraps operations and manages state transitions (CLOSED, OPEN, HALF_OPEN)
 * based on failure thresholds, success thresholds, and timeout configurations.
 */
export class CircuitBreaker {
  private readonly options: CircuitBreakerOptions;
  private state: CircuitBreakerState;
  private failureCount: number;
  private successCount: number;
  private lastFailureTime: number;
  private lastSuccessTime: number;
  private lastOpenTime: number;
  private lastHalfOpenTime: number;
  private lastClosedTime: number;
  private activeTrialsCount: number;

  /**
   * Initializes a new instance of the CircuitBreaker.
   * Validates options using Zod and initializes state fields.
   *
   * @param options Configuration options for the circuit breaker.
   * @throws {z.ZodError} If the provided options fail validation.
   */
  constructor(options: CircuitBreakerOptions) {
    const validated = CircuitBreakerOptionsSchema.parse(options);
    this.options = { ...DEFAULT_OPTIONS, ...validated };
    this.state = CircuitBreakerState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.activeTrialsCount = 0;
    this.lastFailureTime = 0;
    this.lastSuccessTime = 0;
    this.lastOpenTime = 0;
    this.lastHalfOpenTime = 0;
    this.lastClosedTime = Date.now();
  }

  /**
   * Returns the current state of the circuit breaker.
   */
  public getState(): CircuitBreakerState {
    return this.state;
  }

  /**
   * Returns the configuration options of the circuit breaker.
   */
  public getOptions(): CircuitBreakerOptions {
    return this.options;
  }

  /**
   * Returns statistics and timestamps of the circuit breaker.
   */
  public getStats() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
      lastOpenTime: this.lastOpenTime,
      lastHalfOpenTime: this.lastHalfOpenTime,
      lastClosedTime: this.lastClosedTime,
      activeTrialsCount: this.activeTrialsCount,
    };
  }

  /**
   * Resets the circuit breaker to the CLOSED state and resets all stats.
   */
  public reset(): void {
    const previousState = this.state;
    this.state = CircuitBreakerState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.activeTrialsCount = 0;
    this.lastFailureTime = 0;
    this.lastSuccessTime = 0;
    this.lastOpenTime = 0;
    this.lastHalfOpenTime = 0;
    this.lastClosedTime = Date.now();
    if (
      previousState !== CircuitBreakerState.CLOSED &&
      this.options.onStateChange
    ) {
      try {
        this.options.onStateChange(
          previousState,
          CircuitBreakerState.CLOSED,
          this.options.name,
        );
      } catch (e) {
        this.logCallbackError("onStateChange", e);
      }
    }
    if (this.options.onCircuitClosed) {
      try {
        this.options.onCircuitClosed(this.options.name);
      } catch (e) {
        this.logCallbackError("onCircuitClosed", e);
      }
    }
  }
  /**
   * Forces the circuit breaker into the OPEN state.
   */
  public open(): void {
    this.transitionTo(CircuitBreakerState.OPEN);
  }

  /**
   * Forces the circuit breaker into the HALF_OPEN state.
   */
  public halfOpen(): void {
    this.transitionTo(CircuitBreakerState.HALF_OPEN);
  }

  /**
   * Executes a given operation under the protection of the circuit breaker.
   *
   * @param fn The function to execute.
   * @returns The resolved value of the executed function.
   * @throws {CircuitBreakerOpenError} If the circuit breaker is OPEN.
   * @throws {CircuitBreakerHalfOpenError} If the circuit breaker is HALF_OPEN and max concurrent trials are reached.
   * @throws {CircuitBreakerTimeoutError} If the operation takes longer than the configured timeout limit.
   * @throws {Error} Any error thrown by the executed function.
   */
  public async execute<T>(fn: () => Promise<T> | T): Promise<T> {
    this.checkRecovery();

    if (this.state === CircuitBreakerState.OPEN) {
      throw new CircuitBreakerOpenError();
    }

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      const maxTrials = this.options.halfOpenMaxTrials ?? 3;
      if (this.activeTrialsCount >= maxTrials) {
        throw new CircuitBreakerHalfOpenError();
      }
      this.activeTrialsCount++;
    }

    const timeoutMs = this.options.timeoutMs ?? 5000;
    let timerId: NodeJS.Timeout | undefined;

    try {
      let promise = Promise.resolve().then(() => fn());

      if (timeoutMs > 0) {
        const timeoutPromise = new Promise<never>((_, reject) => {
          timerId = setTimeout(() => {
            if (this.options.onCircuitTimeout) {
              try {
                this.options.onCircuitTimeout(this.options.name);
              } catch (e) {
                this.logCallbackError("onCircuitTimeout", e);
              }
            }
            reject(new CircuitBreakerTimeoutError());
          }, timeoutMs);
        });
        promise = Promise.race([promise, timeoutPromise]);
      }

      const result = await promise;

      if (timerId) {
        clearTimeout(timerId);
      }

      this.handleSuccess();
      return result;
    } catch (error) {
      if (timerId) {
        clearTimeout(timerId);
      }
      this.handleFailure(
        error instanceof Error ? error : new Error(String(error)),
      );
      throw error;
    }
  }

  /**
   * Checks if the recovery timeout has elapsed while in the OPEN state,
   * transitioning to HALF_OPEN if it has.
   */
  private checkRecovery(): void {
    if (this.state === CircuitBreakerState.OPEN) {
      const now = Date.now();
      const recoveryTimeout = this.options.recoveryTimeout ?? 60000;
      if (now - this.lastOpenTime >= recoveryTimeout) {
        this.transitionTo(CircuitBreakerState.HALF_OPEN);
      }
    }
  }

  /**
   * Transitions the circuit breaker to a new state and triggers corresponding callbacks.
   */
  private transitionTo(newState: CircuitBreakerState): void {
    const oldState = this.state;
    if (oldState === newState) return;

    this.state = newState;
    const now = Date.now();

    if (this.options.onStateChange) {
      try {
        this.options.onStateChange(oldState, newState, this.options.name);
      } catch (e) {
        this.logCallbackError("onStateChange", e);
      }
    }

    switch (newState) {
      case CircuitBreakerState.CLOSED:
        this.failureCount = 0;
        this.successCount = 0;
        this.activeTrialsCount = 0;
        this.lastClosedTime = now;
        this.triggerCallback("onCircuitClosed");
        break;

      case CircuitBreakerState.OPEN:
        this.lastOpenTime = now;
        this.activeTrialsCount = 0;
        this.triggerCallback("onCircuitOpen");
        break;

      case CircuitBreakerState.HALF_OPEN:
        this.successCount = 0;
        this.failureCount = 0;
        this.activeTrialsCount = 0;
        this.lastHalfOpenTime = now;
        this.triggerCallback("onCircuitHalfOpen");
        break;
    }
  }

  /**
   * Handles a successful execution by updating stats and checking if state should transition back to CLOSED.
   */
  private handleSuccess(): void {
    const now = Date.now();
    this.lastSuccessTime = now;

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.activeTrialsCount = Math.max(0, this.activeTrialsCount - 1);
      this.successCount++;
      const successThreshold = this.options.successThreshold ?? 3;
      if (this.successCount >= successThreshold) {
        this.transitionTo(CircuitBreakerState.CLOSED);
      }
    } else if (this.state === CircuitBreakerState.CLOSED) {
      this.failureCount = 0;
    }

    if (this.options.onSuccess) {
      try {
        this.options.onSuccess(this.options.name);
      } catch (e) {
        this.logCallbackError("onSuccess", e);
      }
    }
  }

  /**
   * Handles a failed execution by updating stats and checking if state should transition to OPEN.
   */
  private handleFailure(error: Error): void {
    const now = Date.now();
    this.lastFailureTime = now;

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.activeTrialsCount = Math.max(0, this.activeTrialsCount - 1);
      this.transitionTo(CircuitBreakerState.OPEN);
    } else if (this.state === CircuitBreakerState.CLOSED) {
      this.failureCount++;
      const failureThreshold = this.options.failureThreshold ?? 5;
      if (this.failureCount >= failureThreshold) {
        this.transitionTo(CircuitBreakerState.OPEN);
      }
    }

    if (this.options.onError) {
      try {
        this.options.onError(error, this.options.name);
      } catch (e) {
        this.logCallbackError("onError", e);
      }
    }
  }

  private triggerCallback(
    callbackName: "onCircuitClosed" | "onCircuitOpen" | "onCircuitHalfOpen",
  ): void {
    const callback = this.options[callbackName];
    if (callback) {
      try {
        callback(this.options.name);
      } catch (e) {
        this.logCallbackError(callbackName, e);
      }
    }
  }

  private logCallbackError(callbackName: string, error: unknown): void {
    const msg = `CircuitBreaker ${callbackName} callback failed`;
    try {
      if (this.options.logger) {
        this.options.logger.error(
          {
            module: "circuit-breaker",
            circuit: this.options.name,
            callback: callbackName,
            err: error instanceof Error ? error : new Error(String(error)),
          },
          msg,
        );
      } else {
        console.error(`${msg}:`, error);
      }
    } catch {
      console.error(`${msg}:`, error);
    }
  }
}
