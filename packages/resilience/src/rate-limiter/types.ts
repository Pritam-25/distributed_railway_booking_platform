import { z } from "zod";

/**
 * Minimal logger surface — accepts any object with the standard levels.
 * The consuming app passes its own logger (e.g. @irctc/logger);
 * this package does NOT depend on @irctc/logger directly.
 */
export interface LoggerLike {
  info: (obj: Record<string, unknown>, msg: string) => void;
  warn: (obj: Record<string, unknown>, msg: string) => void;
  error: (obj: Record<string, unknown>, msg: string) => void;
}

export interface TokenBucketOptions {
  /** Maximum number of tokens the bucket can hold. Must be >= 1. */
  capacity: number;
  /** Tokens added per second. Must be > 0. */
  refillPerSec: number;
}

export const TokenBucketOptionsSchema = z.object({
  capacity: z
    .number()
    .int()
    .refine((n) => n >= 1, {
      message: "capacity must be a finite number >= 1",
    }),
  refillPerSec: z.number().refine((n) => n > 0, {
    message: "refillPerSec must be a finite number > 0",
  }),
});

export interface RateLimitResult {
  /** Whether the request was allowed. */
  allowed: boolean;
  /** Remaining tokens after this request (0 if denied). */
  remaining: number;
  /** Milliseconds until the next token becomes available (0 if allowed). */
  resetMs: number;
}
