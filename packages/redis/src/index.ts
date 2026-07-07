/**
 * @module @irctc/redis
 * Entry point for the Redis integration package.
 * Exports the Redis client initialization helper and the Idempotency Repository.
 */

export * from "./client.js";
export * from "./idempotency.repository.js";
export type { Redis } from "ioredis";
