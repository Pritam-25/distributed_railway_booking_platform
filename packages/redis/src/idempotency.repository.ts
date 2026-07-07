import type { Redis } from "ioredis";

/**
 * Lifecycle states stored in Redis for tracking message idempotency.
 * Distinguishes in-flight work from completed, successful processing.
 */
export const IDEMPOTENCY_STATE = {
  /** The message is currently being processed by a consumer. */
  PROCESSING: "PROCESSING",
  /** The message has been successfully processed and side effects have been committed. */
  PROCESSED: "PROCESSED",
} as const;

/**
 * Union type of all possible states in {@link IDEMPOTENCY_STATE}.
 */
export type IdempotencyState =
  (typeof IDEMPOTENCY_STATE)[keyof typeof IDEMPOTENCY_STATE];

/**
 * Lua script to atomically remove an idempotency key ONLY if its current state is `PROCESSING`.
 * This prevents a `release()` call from accidentally deleting a `PROCESSED` state marker
 * if a race condition occurs between different consumers or redeliveries.
 */
const RELEASE_IF_PROCESSING_SCRIPT = `
if redis.call('get', KEYS[1]) == ARGV[1] then
  return redis.call('del', KEYS[1])
else
  return 0
end
`;

/**
 * A Redis-backed service that prevents the same Kafka message from being processed more than once.
 *
 * It uses a multi-step check to handle messages safely:
 *
 * - **`reserveIfNew(eventId)`**: Checks if the message is already being handled.
 *   - If it is new, it locks it (sets status to `PROCESSING`) for a short time (the "lease").
 *   - If the server crashes mid-process, this lock expires automatically so the message can be retried.
 * - **`markProcessed(eventId)`**: Marks the message as fully completed (sets status to `PROCESSED`) with a longer expiration.
 * - **`release(eventId)`**: Deletes the lock if an error occurs mid-process, allowing the message to be retried immediately.
 */
export class IdempotencyRepository {
  /**
   * Creates an instance of the IdempotencyRepository.
   *
   * @param redis - The ioredis client instance.
   * @param processingLeaseSeconds - TTL (in seconds) for the in-flight processing lease.
   * @param processedTtlSeconds - TTL (in seconds) for the completed processing log.
   * @param keyspace - Namespace prefix to isolate keys in Redis.
   */
  constructor(
    private readonly redis: Redis,
    private readonly processingLeaseSeconds: number,
    private readonly processedTtlSeconds: number,
    private readonly keyspace: string,
  ) {}

  /**
   * Constructs the full Redis key for a given event ID.
   *
   * @param eventId - The unique event identifier.
   * @returns The namespace-prefixed Redis key.
   */
  private buildKey(eventId: string): string {
    return `${this.keyspace}:${eventId}`;
  }

  /**
   * Atomically attempts to reserve an event ID under the `PROCESSING` state.
   * Succeeds if and only if the key does not already exist.
   *
   * @param eventId - The unique event identifier to claim.
   * @returns A promise resolving to `true` if the reservation succeeded, or `false` if it is already claimed or processed.
   */
  async reserveIfNew(eventId: string): Promise<boolean> {
    const res = await this.redis.set(
      this.buildKey(eventId),
      IDEMPOTENCY_STATE.PROCESSING,
      "EX",
      this.processingLeaseSeconds,
      "NX",
    );
    return res === "OK";
  }

  /**
   * Transitions the event reservation state to `PROCESSED` with the final TTL.
   * This is called after the consumer successfully processes the message.
   *
   * @param eventId - The unique event identifier to mark as completed.
   * @returns A promise resolving when the update is complete.
   */
  async markProcessed(eventId: string): Promise<void> {
    await this.redis.set(
      this.buildKey(eventId),
      IDEMPOTENCY_STATE.PROCESSED,
      "EX",
      this.processedTtlSeconds,
    );
  }

  /**
   * Releases an in-flight reservation by deleting the key.
   * Uses a Lua script to ensure we only delete the key if it is still in the `PROCESSING` state,
   * avoiding accidental deletion of keys that have already been marked as `PROCESSED`.
   *
   * @param eventId - The unique event identifier to release.
   * @returns A promise resolving when the release is done.
   */
  async release(eventId: string): Promise<void> {
    await this.redis.eval(
      RELEASE_IF_PROCESSING_SCRIPT,
      1,
      this.buildKey(eventId),
      IDEMPOTENCY_STATE.PROCESSING,
    );
  }
}
