import { test, describe } from "node:test";
import assert from "node:assert";
import { CircuitBreakerRegistry } from "../registry.js";
import { CircuitBreakerState } from "../types.js";

describe("CircuitBreakerRegistry", () => {
  test("should register and retrieve a circuit breaker", () => {
    const registry = new CircuitBreakerRegistry();
    const cb = registry.get("my-breaker", { failureThreshold: 3 });

    assert.strictEqual(cb.getOptions().name, "my-breaker");
    assert.strictEqual(cb.getOptions().failureThreshold, 3);

    const cb2 = registry.get("my-breaker");
    assert.strictEqual(cb, cb2);
  });

  test("should throw an error if registering options on an existing breaker", () => {
    const registry = new CircuitBreakerRegistry();
    registry.get("my-breaker", { failureThreshold: 3 });

    assert.throws(() => {
      registry.get("my-breaker", { failureThreshold: 4 });
    }, /already exists/);
  });

  test("should clear registry", () => {
    const registry = new CircuitBreakerRegistry();
    const cb1 = registry.get("my-breaker");
    registry.clear();
    const cb2 = registry.get("my-breaker");
    assert.notStrictEqual(cb1, cb2);
  });

  test("should propagate state changes to registry and options onStateChange callbacks", async () => {
    let registryCallbackCalled = 0;
    let localCallbackCalled = 0;

    const registry = new CircuitBreakerRegistry({
      onStateChange: (name, from, to) => {
        registryCallbackCalled++;
        assert.strictEqual(name, "my-breaker");
        assert.strictEqual(from, CircuitBreakerState.CLOSED);
        assert.strictEqual(to, CircuitBreakerState.OPEN);
      },
    });

    const cb = registry.get("my-breaker", {
      failureThreshold: 1,
      onStateChange: (from, to, name) => {
        localCallbackCalled++;
        assert.strictEqual(name, "my-breaker");
        assert.strictEqual(from, CircuitBreakerState.CLOSED);
        assert.strictEqual(to, CircuitBreakerState.OPEN);
      },
    });

    // Trip the breaker to trigger state transition
    await assert.rejects(
      cb.execute(() => Promise.reject(new Error("Failure"))),
    );

    assert.strictEqual(registryCallbackCalled, 1);
    assert.strictEqual(localCallbackCalled, 1);
  });
});
