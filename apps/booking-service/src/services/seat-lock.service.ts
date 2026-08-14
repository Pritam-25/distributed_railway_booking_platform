import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Redis } from "@irctc/redis";
import { logger } from "@irctc/logger";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Arguments for acquiring Redis distributed seat locks.
 */
export interface AcquireSeatLocksArgs {
  scheduleId: string;
  seatIds: string[];
  lockToken: string;
  ttlSeconds: number;
  legIndices?: number[] | undefined;
}

/**
 * Arguments for releasing Redis distributed seat locks.
 */
export interface ReleaseSeatLocksArgs {
  scheduleId: string;
  seatIds: string[];
  lockToken: string;
  legIndices?: number[] | undefined;
}

/**
 * Arguments for renewing TTL on Redis distributed seat locks.
 */
export interface RenewSeatLocksArgs {
  scheduleId: string;
  seatIds: string[];
  lockToken: string;
  ttlSeconds: number;
  legIndices?: number[] | undefined;
}

/**
 * Service providing atomic, distributed seat locking using Redis and server-side Lua scripts.
 *
 * ### Key Design & Concurrency Guarantees
 * - **Atomic Multi-Key Locks**: Acquires or releases locks across multiple seats atomically in a single Lua execution step.
 * - **Automatic Rollback**: If any single seat in a requested batch is already held, the Lua script rolls back all previously acquired locks in the batch before returning `0`.
 * - **Partial Booking / Segment Lock Keys**: Supports journey leg indexing. When `legIndices` are provided, keys are scoped per leg (`booking:lock:seat:{scheduleId}:{seatId}:leg:{legIndex}`) so passengers booking non-overlapping route segments (e.g. Station 1->3 vs Station 4->6) can reserve the same physical seat without false lock conflicts.
 * - **Full Schedule Fallback**: When `legIndices` is omitted or empty, keys default to full schedule scope (`booking:lock:seat:{scheduleId}:{seatId}`).
 * - **Sorting Guarantee**: Seat IDs and leg indices are sorted lexicographically before lock evaluation to prevent deadlocks when concurrent requests overlap.
 */
export class SeatLockService {
  /** Raw string content of `seat-lock.lua` script */
  private readonly lockScript: string;

  /** Raw string content of `seat-unlock.lua` script */
  private readonly unlockScript: string;

  /** Raw string content of `seat-renew.lua` script */
  private readonly renewScript: string;

  /**
   * Initializes `SeatLockService` and loads the Redis Lua scripts from the file system.
   *
   * @param redis - The Redis client instance used to execute Lua scripts.
   */
  constructor(private readonly redis: Redis) {
    this.lockScript = fs.readFileSync(
      path.resolve(__dirname, "../lua/seat-lock.lua"),
      "utf8",
    );
    this.unlockScript = fs.readFileSync(
      path.resolve(__dirname, "../lua/seat-unlock.lua"),
      "utf8",
    );
    this.renewScript = fs.readFileSync(
      path.resolve(__dirname, "../lua/seat-renew.lua"),
      "utf8",
    );
  }

  /**
   * Generates Redis lock keys for the specified seats and optional journey leg indices.
   *
   * When `legIndices` are provided, keys are leg-scoped (`booking:lock:seat:{scheduleId}:{seatId}:leg:{legIndex}`)
   * to allow non-overlapping segment bookings on the same seat.
   * When `legIndices` is omitted or empty, keys fall back to full schedule scope (`booking:lock:seat:{scheduleId}:{seatId}`).
   *
   * @param scheduleId - The schedule UUID.
   * @param seatIds - List of seat UUIDs.
   * @param legIndices - Optional list of leg sequence indices covered by the journey segment.
   * @returns Array of sorted Redis key strings.
   */
  public getLockKeys(
    scheduleId: string,
    seatIds: string[],
    legIndices?: number[],
  ): string[] {
    const sortedSeatIds = [...seatIds].sort((a, b) => a.localeCompare(b));

    if (!legIndices || legIndices.length === 0) {
      return sortedSeatIds.map((id) => `booking:lock:seat:${scheduleId}:${id}`);
    }

    const sortedLegIndices = [...new Set(legIndices)].sort((a, b) => a - b);
    const keys: string[] = [];
    for (const seatId of sortedSeatIds) {
      for (const legIndex of sortedLegIndices) {
        keys.push(`booking:lock:seat:${scheduleId}:${seatId}:leg:${legIndex}`);
      }
    }
    return keys;
  }

  /**
   * Atomically acquires Redis distributed locks for a set of seats (and optional journey legs) on a given schedule.
   *
   * @param args - Acquisition parameters object.
   * @param args.scheduleId - The schedule UUID to scope seat locks against.
   * @param args.seatIds - List of seat UUIDs to lock.
   * @param args.lockToken - Unique token identifying the lock owner (e.g. `bookingId`).
   * @param args.ttlSeconds - Time-to-live in seconds after which Redis will automatically expire the locks.
   * @param args.legIndices - Optional list of journey leg sequence indices (e.g. `[1, 2]` for Station 1 to Station 3).
   * @returns `true` if all seat/leg locks were successfully acquired; `false` if any seat/leg was already locked or on error.
   */
  async acquireSeatLocks({
    scheduleId,
    seatIds,
    lockToken,
    ttlSeconds,
    legIndices,
  }: AcquireSeatLocksArgs): Promise<boolean> {
    if (seatIds.length === 0) return true;

    const keys = this.getLockKeys(scheduleId, seatIds, legIndices);
    const args: string[] = [...keys, lockToken, ttlSeconds.toString()];

    try {
      const result = await this.redis.eval(
        this.lockScript,
        keys.length,
        ...args,
      );
      const success = Number(result) === 1;
      logger.info(
        {
          module: "seat-lock-service",
          scheduleId,
          seatIds,
          legIndices,
          lockToken,
          keyCount: keys.length,
          success,
        },
        "Redis seat locks acquire attempt",
      );
      return success;
    } catch (error) {
      logger.error(
        { module: "seat-lock-service", scheduleId, seatIds, legIndices, error },
        "Error acquiring seat locks via Redis Lua",
      );
      return false;
    }
  }

  /**
   * Atomically releases Redis distributed locks for a set of seats (and optional journey legs) on a given schedule if owned by the lock token.
   *
   * @param args - Release parameters object.
   * @param args.scheduleId - The schedule UUID matching the acquired locks.
   * @param args.seatIds - List of seat UUIDs to release.
   * @param args.lockToken - Unique lock owner token (`bookingId`) used when acquiring locks.
   * @param args.legIndices - Optional list of journey leg sequence indices matching the acquired locks.
   * @returns The number of seat locks successfully released.
   */
  async releaseSeatLocks({
    scheduleId,
    seatIds,
    lockToken,
    legIndices,
  }: ReleaseSeatLocksArgs): Promise<number> {
    if (seatIds.length === 0) return 0;

    const keys = this.getLockKeys(scheduleId, seatIds, legIndices);
    const args: string[] = [...keys, lockToken];

    try {
      const result = await this.redis.eval(
        this.unlockScript,
        keys.length,
        ...args,
      );
      const releasedCount = Number(result);
      logger.info(
        {
          module: "seat-lock-service",
          scheduleId,
          seatIds,
          legIndices,
          lockToken,
          keyCount: keys.length,
          releasedCount,
        },
        "Redis seat locks release attempt",
      );
      return releasedCount;
    } catch (error) {
      logger.error(
        { module: "seat-lock-service", scheduleId, seatIds, legIndices, error },
        "Error releasing seat locks via Redis Lua",
      );
      return 0;
    }
  }

  /**
   * Atomically extends/renews the TTL of held Redis distributed seat locks.
   *
   * @param args - Renewal parameters object.
   * @param args.scheduleId - The schedule UUID matching the acquired locks.
   * @param args.seatIds - List of seat UUIDs whose lock TTL should be extended.
   * @param args.lockToken - Unique lock owner token (`bookingId`).
   * @param args.ttlSeconds - New TTL duration in seconds to apply to the locks.
   * @param args.legIndices - Optional list of journey leg sequence indices matching the acquired locks.
   * @returns `true` if all locks were owned by `lockToken` and successfully renewed; `false` otherwise.
   */
  async renewSeatLocks({
    scheduleId,
    seatIds,
    lockToken,
    ttlSeconds,
    legIndices,
  }: RenewSeatLocksArgs): Promise<boolean> {
    if (seatIds.length === 0) return true;

    const keys = this.getLockKeys(scheduleId, seatIds, legIndices);
    const args: string[] = [...keys, lockToken, ttlSeconds.toString()];

    try {
      const result = await this.redis.eval(
        this.renewScript,
        keys.length,
        ...args,
      );
      const success = Number(result) === 1;
      logger.info(
        {
          module: "seat-lock-service",
          scheduleId,
          seatIds,
          legIndices,
          lockToken,
          keyCount: keys.length,
          success,
          ttlSeconds,
        },
        "Redis seat locks renew attempt",
      );
      return success;
    } catch (error) {
      logger.error(
        { module: "seat-lock-service", scheduleId, seatIds, legIndices, error },
        "Error renewing seat locks via Redis Lua",
      );
      return false;
    }
  }
}
