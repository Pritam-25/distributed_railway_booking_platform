import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import type { Redis } from "ioredis";
import {
  LoggerLike,
  RateLimitResult,
  TokenBucketOptions,
  TokenBucketOptionsSchema,
} from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LUA_SCRIPT = fs.readFileSync(
  path.resolve(__dirname, "./increment-token.lua"),
  "utf8",
);

/**
 * Token bucket rate limiter backed by an atomic Redis Lua script.
 *
 * Each call to `consume()` is a single Redis round-trip (EVALSHA with
 * EVAL fallback). The Lua script handles refill, consume, TTL, and
 * retry-after computation atomically — no race conditions.
 *
 * Time is derived from Redis server time (not application Date.now())
 * to avoid clock-skew issues in multi-node deployments.
 */
export class TokenBucketRateLimiter {
  private readonly redis: Redis;
  private readonly logger?: LoggerLike;
  private scriptSha: string | null = null;

  constructor(redis: Redis, logger?: LoggerLike) {
    this.redis = redis;
    this.logger = logger;
  }

  /**
   * Attempt to consume one token from the bucket identified by `key`.
   *
   * @param key     — unique rate-limit key, e.g. `"rl:user:123"` or `"rl:ip:1.2.3.4"`
   * @param opts    — bucket configuration (capacity and refill rate)
   * @returns       whether the request is allowed, remaining tokens, and retry-after ms
   */
  async consume(
    key: string,
    opts: TokenBucketOptions,
  ): Promise<RateLimitResult> {
    const { capacity, refillPerSec } = TokenBucketOptionsSchema.parse(opts);

    try {
      const result = await this.evalLua(key, capacity, refillPerSec);
      return result;
    } catch (err) {
      this.logger?.error(
        { module: "token-bucket", err: err as Error },
        "Rate limiter Lua eval failed",
      );
      throw err;
    }
  }

  /**
   * Evaluates the Lua script via EVALSHA (with EVAL fallback on first call
   * or after a Redis SCRIPT FLUSH).
   */
  private async evalLua(
    key: string,
    capacity: number,
    refillPerSec: number,
  ): Promise<RateLimitResult> {
    // Try EVALSHA first (fast path) if we have a cached SHA
    if (this.scriptSha) {
      try {
        const raw = await this.redis.evalsha(
          this.scriptSha,
          1,
          key,
          capacity.toString(),
          refillPerSec.toString(),
        );
        return this.parseResult(raw);
      } catch (err: unknown) {
        // NOSCRIPT — script was flushed, fall through to EVAL
        if (err instanceof Error && err.message.includes("NOSCRIPT")) {
          this.scriptSha = null;
        } else {
          throw err;
        }
      }
    }

    // Load script via SCRIPT LOAD and then EVALSHA
    const sha = (await this.redis.script("LOAD", LUA_SCRIPT)) as string;
    this.scriptSha = sha;

    const raw = await this.redis.evalsha(
      sha,
      1,
      key,
      capacity.toString(),
      refillPerSec.toString(),
    );
    return this.parseResult(raw);
  }

  private parseResult(raw: unknown): RateLimitResult {
    const arr = raw as [number, number, number];
    return {
      allowed: arr[0] === 1,
      remaining: arr[1]!,
      resetMs: arr[2]!,
    };
  }
}
