import { test, describe } from "node:test";
import assert from "node:assert";
import { ZodError } from "zod";
import { TokenBucketRateLimiter } from "../TokenBucketRateLimiter.js";
import type { Redis } from "ioredis";

// Helper to delay execution
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class MockRedis {
  public store = new Map<string, { tokens: number; lastRefill: number }>();
  public scriptSha = "mock-sha-12345";
  public evalCount = 0;
  public scriptLoadCount = 0;
  public shouldFail = false;

  async script(op: string, _scriptText?: string): Promise<string> {
    if (this.shouldFail) {
      throw new Error("Redis connection lost");
    }
    if (op === "LOAD") {
      this.scriptLoadCount++;
      return this.scriptSha;
    }
    throw new Error("Unknown script operation");
  }

  async evalsha(
    sha: string,
    _numKeys: number,
    key: string,
    capacityStr: string,
    refillPerSecStr: string,
  ): Promise<[number, number, number]> {
    if (this.shouldFail) {
      throw new Error("Redis connection lost");
    }
    this.evalCount++;
    if (sha !== this.scriptSha) {
      throw new Error("NOSCRIPT No matching script. Please use EVAL.");
    }
    const capacity = parseFloat(capacityStr);
    const refillPerSec = parseFloat(refillPerSecStr);
    const nowMs = Date.now();

    let data = this.store.get(key);
    if (!data) {
      data = { tokens: capacity, lastRefill: nowMs };
    }

    const elapsedMs = Math.max(0, nowMs - data.lastRefill);
    const elapsedSec = elapsedMs / 1000.0;
    const refill = elapsedSec * refillPerSec;
    let tokens = Math.min(capacity, data.tokens + refill);

    let allowed = 0;
    let remaining = Math.floor(tokens);
    let resetMs = 0;

    if (tokens >= 1) {
      tokens = tokens - 1;
      allowed = 1;
      remaining = Math.floor(tokens);
    } else {
      const deficit = 1 - tokens;
      resetMs = Math.ceil((deficit / refillPerSec) * 1000);
    }

    this.store.set(key, { tokens, lastRefill: nowMs });
    return [allowed, remaining, resetMs];
  }
}

describe("TokenBucketRateLimiter", () => {
  test("should allow consumption when tokens are available", async () => {
    const mockRedis = new MockRedis() as unknown as Redis;
    const limiter = new TokenBucketRateLimiter(mockRedis);

    const result = await limiter.consume("rl:test:1", {
      capacity: 5,
      refillPerSec: 1,
    });

    assert.strictEqual(result.allowed, true);
    assert.strictEqual(result.remaining, 4);
    assert.strictEqual(result.resetMs, 0);
  });

  test("should deny consumption when bucket is empty", async () => {
    const mockRedis = new MockRedis() as unknown as Redis;
    const limiter = new TokenBucketRateLimiter(mockRedis);

    // Consume all tokens (capacity: 1)
    const result1 = await limiter.consume("rl:test:2", {
      capacity: 1,
      refillPerSec: 1,
    });
    assert.strictEqual(result1.allowed, true);
    assert.strictEqual(result1.remaining, 0);

    // Second request should be denied
    const result2 = await limiter.consume("rl:test:2", {
      capacity: 1,
      refillPerSec: 1,
    });
    assert.strictEqual(result2.allowed, false);
    assert.strictEqual(result2.remaining, 0);
    assert.ok(result2.resetMs > 0);
  });

  test("should refill tokens over time", async () => {
    const mockRedis = new MockRedis() as unknown as Redis;
    const limiter = new TokenBucketRateLimiter(mockRedis);

    // Drain the bucket (capacity: 1)
    await limiter.consume("rl:test:3", { capacity: 1, refillPerSec: 10 });

    // Try again immediately - should be denied
    const denied = await limiter.consume("rl:test:3", {
      capacity: 1,
      refillPerSec: 10,
    });
    assert.strictEqual(denied.allowed, false);

    // Wait 150ms to refill (refill rate: 10 tokens/sec, so 1 token every 100ms)
    await delay(150);

    const allowed = await limiter.consume("rl:test:3", {
      capacity: 1,
      refillPerSec: 10,
    });
    assert.strictEqual(allowed.allowed, true);
    assert.strictEqual(allowed.remaining, 0);
  });

  test("should enforce input boundaries on capacity and refill rate", async () => {
    const mockRedis = new MockRedis() as unknown as Redis;
    const limiter = new TokenBucketRateLimiter(mockRedis);

    await assert.rejects(
      limiter.consume("rl:test:4", { capacity: 0, refillPerSec: 1 }),
      ZodError,
    );

    await assert.rejects(
      limiter.consume("rl:test:4", { capacity: 5, refillPerSec: -1 }),
      ZodError,
    );
  });

  test("should fail-safe and propagate Redis connection errors to client", async () => {
    const mockRedis = new MockRedis();
    mockRedis.shouldFail = true;
    const limiter = new TokenBucketRateLimiter(mockRedis as unknown as Redis);

    await assert.rejects(
      limiter.consume("rl:test:5", { capacity: 5, refillPerSec: 1 }),
      /Redis connection lost/,
    );
  });

  test("should load script and utilize EVALSHA on subsequent requests", async () => {
    const mockRedis = new MockRedis();
    const limiter = new TokenBucketRateLimiter(mockRedis as unknown as Redis);

    // First request: script load + evalsha
    await limiter.consume("rl:test:6", { capacity: 5, refillPerSec: 1 });
    assert.strictEqual(mockRedis.scriptLoadCount, 1);
    assert.strictEqual(mockRedis.evalCount, 1);

    // Second request: evalsha directly without reloading
    await limiter.consume("rl:test:6", { capacity: 5, refillPerSec: 1 });
    assert.strictEqual(mockRedis.scriptLoadCount, 1);
    assert.strictEqual(mockRedis.evalCount, 2);
  });
});
