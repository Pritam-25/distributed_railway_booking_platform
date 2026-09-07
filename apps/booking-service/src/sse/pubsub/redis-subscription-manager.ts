import type { Redis } from "@irctc/redis";
import { logger } from "@irctc/logger";

/**
 * ## RedisSubscriptionManager
 *
 * Lightweight infrastructure utility managing Pub/Sub channel reference-counts
 * on the service's shared `redisSubscriber` connection.
 *
 * Subscribes to a Redis channel when the first local client observes it,
 * and unsubscribes when no local clients remain.
 */
export class RedisSubscriptionManager {
  private readonly refCounts = new Map<string, number>();

  /**
   * @param redisSubscriber - Shared service subscriber Redis client (`redisSubscriber`).
   */
  constructor(private readonly redisSubscriber: Redis) {}

  /**
   * Increments the reference count for a Redis channel and issues `SUBSCRIBE`
   * on the first reference.
   *
   * @param channel - The Redis Pub/Sub channel name.
   */
  async ref(channel: string): Promise<void> {
    const current = this.refCounts.get(channel) ?? 0;
    const updated = current + 1;
    this.refCounts.set(channel, updated);

    if (current === 0) {
      try {
        await this.redisSubscriber.subscribe(channel);
        logger.info(
          { module: "redis-subscription-manager", channel },
          "Subscribed to dynamic Redis Pub/Sub channel (1st viewer)",
        );
      } catch (err) {
        logger.error(
          { module: "redis-subscription-manager", channel, err },
          "Failed to subscribe to Redis Pub/Sub channel",
        );
        this.refCounts.set(channel, current);
        throw err;
      }
    }
  }

  /**
   * Decrements the reference count for a Redis channel and issues `UNSUBSCRIBE`
   * when reference count reaches 0.
   *
   * @param channel - The Redis Pub/Sub channel name.
   */
  async unref(channel: string): Promise<void> {
    const current = this.refCounts.get(channel) ?? 0;
    if (current <= 0) return;

    const updated = current - 1;
    if (updated === 0) {
      this.refCounts.delete(channel);
      try {
        await this.redisSubscriber.unsubscribe(channel);
        logger.info(
          { module: "redis-subscription-manager", channel },
          "Unsubscribed from dynamic Redis Pub/Sub channel (0 viewers remaining)",
        );
      } catch (err) {
        logger.error(
          { module: "redis-subscription-manager", channel, err },
          "Failed to unsubscribe from Redis Pub/Sub channel",
        );
      }
    } else {
      this.refCounts.set(channel, updated);
    }
  }

  /**
   * Returns active reference count for a channel.
   */
  getRefCount(channel: string): number {
    return this.refCounts.get(channel) ?? 0;
  }
}
