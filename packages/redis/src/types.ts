import type { RedisOptions } from "ioredis";

export type { Redis } from "ioredis";

/** Options for creating a standard command Redis client. */
export type CreateRedisClientOptions = Partial<RedisOptions>;

/** Options for creating a dedicated Pub/Sub Redis subscriber client. */
export type CreateSubscriberClientOptions = Partial<RedisOptions>;

/** Diagnostic result produced by a Redis health probe check. */
export interface RedisHealthCheckResult {
  /** Whether the Redis ping probe succeeded. */
  ok: boolean;
  /** Execution latency in milliseconds. */
  latencyMs: number;
  /** Error message detailing probe failure cause. */
  error?: string;
}
