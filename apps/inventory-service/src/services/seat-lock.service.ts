import type { Redis } from "@irctc/redis";
import { logger } from "@irctc/logger";

import { seatLockLua, seatUnlockLua } from "../lua/index.js";

/**
 * Arguments for acquiring inventory-side Redis seat-segment locks.
 *
 * The key shape is `inv:lock:seat:{scheduleId}:{seatInventoryId}:{fromSequence}:{toSequence}` —
 * one key per (seat, segment-range) tuple. Mirrors the `SeatAllocation` row's
 * uniqueness on `(scheduleId, seatInventoryId, fromSequence, toSequence)` so
 * Redis rejections and Prisma rejections agree.
 */
export interface AcquireInventorySeatLocksArgs {
  scheduleId: string;
  /** Per-seat lock entries, each carrying the seat's row id and the segment-range. */
  seatInventorySegments: ReadonlyArray<{
    seatInventoryId: string;
    fromSequence: number;
    toSequence: number;
  }>;
  /** Ownership token (UUID) — same value across all keys in a single call. */
  lockToken: string;
  /** Time-to-live in seconds; default `env.SEAT_LOCK_TTL_SEC` for the inventory critical section. */
  ttlSeconds: number;
}

/**
 * Arguments for releasing inventory-side Redis seat-segment locks.
 */
export interface ReleaseInventorySeatLocksArgs {
  scheduleId: string;
  seatInventorySegments: ReadonlyArray<{
    seatInventoryId: string;
    fromSequence: number;
    toSequence: number;
  }>;
  lockToken: string;
}

/**
 * Service providing atomic, distributed seat-segment locking on the inventory
 * side, used by `SeatAllocationService.holdSeats` to serialize concurrent
 * reservations against the same `(scheduleId, seatInventoryId, fromSequence, toSequence)`
 * tuple before the Prisma transaction commits.
 *
 * ### Why a separate lock on the inventory side?
 * The booking-service saga-side lock (`booking:lock:seat:{scheduleId}:{seatId}:...`)
 * prevents a second booking from starting. This inventory-side lock prevents
 * two consumer instances (e.g. a Kafka redelivery racing a fresh delivery)
 * from both writing the same `SeatAllocation` rows. Each side has its own TTL
 * — the booking-side lock covers the 10-min saga life, this lock covers the
 * ≤30s critical section.
 *
 * ### Why Lua?
 * `seat-lock.lua` runs the multi-key `SET NX EX` atomically with rollback if
 * any single key fails; `seat-unlock.lua` only `DEL`s keys whose current value
 * still equals the caller's `lockToken` (prevents stale-process releases). Both
 * invariants are impossible to protect with plain Redis commands.
 */
export class SeatLockService {
  /**
   * @param redis - Shared Redis client used to execute `EVAL`.
   */
  constructor(private readonly redis: Redis) {}

  /**
   * Builds the sorted list of Redis keys for a (seat, segment) batch.
   * Sorting is deterministic so that two concurrent callers issuing the same
   * set of keys acquire them in the same order, eliminating deadlocks.
   *
   * @internal Exposed for testing.
   */
  public getLockKeys(
    scheduleId: string,
    seatInventorySegments: ReadonlyArray<{
      seatInventoryId: string;
      fromSequence: number;
      toSequence: number;
    }>,
  ): string[] {
    const sortedSegments = [...seatInventorySegments].sort((a, b) => {
      const idCmp = a.seatInventoryId.localeCompare(b.seatInventoryId);
      if (idCmp !== 0) return idCmp;
      if (a.fromSequence !== b.fromSequence)
        return a.fromSequence - b.fromSequence;
      return a.toSequence - b.toSequence;
    });

    return sortedSegments.map(
      (s) =>
        `inv:lock:seat:${scheduleId}:${s.seatInventoryId}:${s.fromSequence}:${s.toSequence}`,
    );
  }

  /**
   * Atomically acquires inventory-side seat-segment locks.
   *
   * @param args - Acquisition parameters (see {@link AcquireInventorySeatLocksArgs}).
   * @returns `true` if every (seat, segment) key was set; `false` if any
   *   collides (with full rollback of the keys set earlier in this call) or if
   *   Redis itself errors. Callers translate a `false` result into
   *   `SeatsHoldFailedV1` with reason `SEAT_ALREADY_HELD`.
   */
  async acquireSeatLocks(
    args: AcquireInventorySeatLocksArgs,
  ): Promise<boolean> {
    const { scheduleId, seatInventorySegments, lockToken, ttlSeconds } = args;

    if (seatInventorySegments.length === 0) return true;

    const keys = this.getLockKeys(scheduleId, seatInventorySegments);

    try {
      const result = await this.redis.eval(
        seatLockLua,
        keys.length,
        ...keys,
        lockToken,
        ttlSeconds.toString(),
      );
      const success = Number(result) === 1;
      logger.info(
        {
          module: "inventory-seat-lock-service",
          scheduleId,
          segmentCount: seatInventorySegments.length,
          keyCount: keys.length,
          lockToken,
          ttlSeconds,
          success,
        },
        "Inventory seat-segment lock acquire attempt",
      );
      return success;
    } catch (error) {
      logger.error(
        {
          module: "inventory-seat-lock-service",
          scheduleId,
          segmentCount: seatInventorySegments.length,
          error,
        },
        "Error acquiring inventory seat-segment locks via Redis Lua",
      );
      return false;
    }
  }

  /**
   * Atomically releases inventory-side seat-segment locks whose value still
   * equals `lockToken`.
   *
   * @param args - Release parameters (see {@link ReleaseInventorySeatLocksArgs}).
   * @returns Count of keys actually deleted (a stale caller whose TTL expired
   *   will see `0` here, not an error).
   */
  async releaseSeatLocks(args: ReleaseInventorySeatLocksArgs): Promise<number> {
    const { scheduleId, seatInventorySegments, lockToken } = args;

    if (seatInventorySegments.length === 0) return 0;

    const keys = this.getLockKeys(scheduleId, seatInventorySegments);

    try {
      const result = await this.redis.eval(
        seatUnlockLua,
        keys.length,
        ...keys,
        lockToken,
      );
      const releasedCount = Number(result);
      logger.info(
        {
          module: "inventory-seat-lock-service",
          scheduleId,
          segmentCount: seatInventorySegments.length,
          keyCount: keys.length,
          lockToken,
          releasedCount,
        },
        "Inventory seat-segment lock release attempt",
      );
      return releasedCount;
    } catch (error) {
      logger.error(
        {
          module: "inventory-seat-lock-service",
          scheduleId,
          segmentCount: seatInventorySegments.length,
          error,
        },
        "Error releasing inventory seat-segment locks via Redis Lua",
      );
      return 0;
    }
  }
}
