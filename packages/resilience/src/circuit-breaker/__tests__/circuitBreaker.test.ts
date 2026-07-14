import { test, describe } from "node:test";
import assert from "node:assert";
import { CircuitBreaker } from "../circuitBreaker.js";
import {
  CircuitBreakerOpenError,
  CircuitBreakerHalfOpenError,
  CircuitBreakerTimeoutError,
  CircuitBreakerState,
} from "../types.js";

// Helper to delay execution
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("CircuitBreaker Initialization", () => {
  test("should initialize with custom options and CLOSED state", () => {
    const cb = new CircuitBreaker({
      name: "test-breaker",
      failureThreshold: 3,
      successThreshold: 2,
      recoveryTimeout: 1000,
    });

    assert.strictEqual(cb.getState(), CircuitBreakerState.CLOSED);
    assert.strictEqual(cb.getOptions().name, "test-breaker");
    assert.strictEqual(cb.getOptions().failureThreshold, 3);
  });

  test("should throw Zod error on invalid options", () => {
    assert.throws(() => {
      new CircuitBreaker({
        name: 123 as any, // Invalid name type
      });
    });

    assert.throws(() => {
      new CircuitBreaker({
        name: "invalid-threshold",
        failureThreshold: -5, // Must be positive
      });
    });
  });
});

describe("CircuitBreaker Closed State Flow", () => {
  test("should execute successfully and return value", async () => {
    const cb = new CircuitBreaker({ name: "test-cb" });
    const result = await cb.execute(() => "hello");
    assert.strictEqual(result, "hello");
    assert.strictEqual(cb.getState(), CircuitBreakerState.CLOSED);
  });

  test("should track failure count and transition to OPEN when threshold is met", async () => {
    let errorCalled = 0;
    let openCalled = 0;

    const cb = new CircuitBreaker({
      name: "test-cb",
      failureThreshold: 2,
      onError: (err: any, name?: string) => {
        errorCalled++;
        assert.strictEqual(name, "test-cb");
      },
      onCircuitOpen: (name?: string) => {
        openCalled++;
        assert.strictEqual(name, "test-cb");
      },
    });

    // First failure
    await assert.rejects(
      cb.execute(() => Promise.reject(new Error("Failure 1"))),
      /Failure 1/,
    );
    assert.strictEqual(cb.getState(), CircuitBreakerState.CLOSED);
    assert.strictEqual(cb.getStats().failureCount, 1);

    // Second failure - should trigger OPEN
    await assert.rejects(
      cb.execute(() => Promise.reject(new Error("Failure 2"))),
      /Failure 2/,
    );
    assert.strictEqual(cb.getState(), CircuitBreakerState.OPEN);
    assert.strictEqual(errorCalled, 2);
    assert.strictEqual(openCalled, 1);
  });

  test("should reset failure count in CLOSED state after a success", async () => {
    const cb = new CircuitBreaker({
      name: "test-cb",
      failureThreshold: 2,
    });

    // 1 failure
    await assert.rejects(cb.execute(() => Promise.reject(new Error("Err"))));
    assert.strictEqual(cb.getStats().failureCount, 1);

    // Success
    await cb.execute(() => "ok");
    assert.strictEqual(cb.getStats().failureCount, 0);

    // Another failure (should not trip since failure count was reset to 0, then incremented to 1)
    await assert.rejects(cb.execute(() => Promise.reject(new Error("Err"))));
    assert.strictEqual(cb.getState(), CircuitBreakerState.CLOSED);
  });
});

describe("CircuitBreaker Open State Flow", () => {
  test("should fail fast when circuit is OPEN", async () => {
    const cb = new CircuitBreaker({
      name: "test-cb",
      failureThreshold: 1,
    });

    // Trip the breaker
    await assert.rejects(cb.execute(() => Promise.reject(new Error("Err"))));
    assert.strictEqual(cb.getState(), CircuitBreakerState.OPEN);

    // Try executing while open
    await assert.rejects(
      cb.execute(() => "should not run"),
      (err: any) => {
        assert.ok(err instanceof CircuitBreakerOpenError);
        assert.strictEqual(err.message, "Circuit breaker is open");
        return true;
      },
    );
  });
});

describe("CircuitBreaker Recovery & Half-Open State Flow", () => {
  test("should transition to HALF_OPEN after recoveryTimeout and test recovery success", async () => {
    let halfOpenCalled = 0;
    let closedCalled = 0;

    const cb = new CircuitBreaker({
      name: "test-cb",
      failureThreshold: 1,
      successThreshold: 2,
      recoveryTimeout: 50, // 50ms recovery
      onCircuitHalfOpen: () => {
        halfOpenCalled++;
      },
      onCircuitClosed: () => {
        closedCalled++;
      },
    });

    // Trip
    await assert.rejects(cb.execute(() => Promise.reject(new Error("Err"))));
    assert.strictEqual(cb.getState(), CircuitBreakerState.OPEN);

    // Wait for recovery timeout to pass
    await delay(60);

    // Execution should now trigger lazy transition to HALF_OPEN and run the supplier
    const res1 = await cb.execute(() => "trial 1");
    assert.strictEqual(res1, "trial 1");
    assert.strictEqual(cb.getState(), CircuitBreakerState.HALF_OPEN);
    assert.strictEqual(halfOpenCalled, 1);

    // Second success should transition to CLOSED
    const res2 = await cb.execute(() => "trial 2");
    assert.strictEqual(res2, "trial 2");
    assert.strictEqual(cb.getState(), CircuitBreakerState.CLOSED);
    assert.strictEqual(closedCalled, 1);
  });

  test("should transition back to OPEN if a trial fails in HALF_OPEN state", async () => {
    const cb = new CircuitBreaker({
      name: "test-cb",
      failureThreshold: 1,
      recoveryTimeout: 50,
    });

    // Trip
    await assert.rejects(cb.execute(() => Promise.reject(new Error("Err"))));
    assert.strictEqual(cb.getState(), CircuitBreakerState.OPEN);

    await delay(60);

    // First trial fails, should immediately open again
    await assert.rejects(
      cb.execute(() => Promise.reject(new Error("Trial fail"))),
      /Trial fail/,
    );
    assert.strictEqual(cb.getState(), CircuitBreakerState.OPEN);
  });

  test("should respect halfOpenMaxTrials and limit parallel executions", async () => {
    const cb = new CircuitBreaker({
      name: "test-cb",
      failureThreshold: 1,
      recoveryTimeout: 50,
      halfOpenMaxTrials: 2,
    });

    // Trip
    await assert.rejects(cb.execute(() => Promise.reject(new Error("Err"))));
    await delay(60);

    // Execute first parallel trial (keeps it pending)
    let resolve1: any;
    const p1 = cb.execute(
      () =>
        new Promise((resolve) => {
          resolve1 = resolve;
        }),
    );

    // Execute second parallel trial (keeps it pending)
    let resolve2: any;
    const p2 = cb.execute(
      () =>
        new Promise((resolve) => {
          resolve2 = resolve;
        }),
    );

    // Third concurrent trial should exceed halfOpenMaxTrials and throw CircuitBreakerHalfOpenError
    await assert.rejects(
      cb.execute(() => "trial 3"),
      (err: any) => {
        assert.ok(err instanceof CircuitBreakerHalfOpenError);
        assert.strictEqual(err.message, "Circuit breaker is half-open");
        return true;
      },
    );

    // Clean up pending trials
    resolve1("ok1");
    resolve2("ok2");
    await Promise.all([p1, p2]);
  });
});

describe("CircuitBreaker Timeouts", () => {
  test("should timeout if execution takes too long", async () => {
    let timeoutCalled = 0;
    const cb = new CircuitBreaker({
      name: "test-cb",
      timeoutMs: 30,
      onCircuitTimeout: (name?: string) => {
        timeoutCalled++;
        assert.strictEqual(name, "test-cb");
      },
    });

    await assert.rejects(
      cb.execute(() => delay(100).then(() => "done")),
      (err: any) => {
        assert.ok(err instanceof CircuitBreakerTimeoutError);
        assert.strictEqual(err.message, "Circuit breaker timeout");
        return true;
      },
    );

    assert.strictEqual(timeoutCalled, 1);
    assert.strictEqual(cb.getStats().failureCount, 1);
  });
});

describe("CircuitBreaker Manual Operations", () => {
  test("should force transitions via open(), halfOpen(), reset()", () => {
    const cb = new CircuitBreaker({ name: "test-cb" });

    cb.open();
    assert.strictEqual(cb.getState(), CircuitBreakerState.OPEN);

    cb.halfOpen();
    assert.strictEqual(cb.getState(), CircuitBreakerState.HALF_OPEN);

    cb.reset();
    assert.strictEqual(cb.getState(), CircuitBreakerState.CLOSED);
    assert.strictEqual(cb.getStats().failureCount, 0);
  });
});
