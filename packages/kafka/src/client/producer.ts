import { KafkaJS } from "@confluentinc/kafka-javascript";
import type { LoggerLike } from "../consumer-runner/kafka-consumer-runner.js";

type Kafka = KafkaJS.Kafka;
type Producer = KafkaJS.Producer;

/**
 * Singleton manager class for creating, caching, and retrieving the shared Kafka Producer instance.
 *
 * Configures standard reliability patterns such as idempotency and auto-topic creation prevention.
 */
export class KafkaProducerManager {
  private static instance: Producer | null = null;

  /**
   * Initializes and returns the shared Kafka Producer instance.
   *
   * If an active instance already exists, it is returned immediately.
   * Establishes the broker connection before storing the instance to ensure
   * `isConnected()` only returns true when the connection is live.
   *
   * @param kafka - Initialized {@link Kafka} client instance.
   * @param logger - Optional diagnostic logger satisfying {@link LoggerLike}.
   * @returns A promise resolving to the initialized and connected shared {@link Producer}.
   */
  static async getProducer(
    kafka: Kafka,
    logger?: LoggerLike,
  ): Promise<Producer> {
    if (this.instance) return this.instance;

    logger?.info(
      { module: "kafka-producer" },
      "Initializing Kafka producer...",
    );

    const producer = kafka.producer({
      kafkaJS: {
        allowAutoTopicCreation: false,
        idempotent: true,
        maxInFlightRequests: 5,
      },
    });

    // Establish broker connection before exposing the instance.
    await producer.connect();
    this.instance = producer;

    logger?.info(
      { module: "kafka-producer" },
      "Kafka producer connected successfully",
    );
    return this.instance;
  }

  /**
   * Checks whether the shared producer instance has been initialized and connected.
   *
   * @returns `true` if the producer is connected, `false` otherwise.
   */
  static isConnected(): boolean {
    return this.instance !== null;
  }

  /**
   * Synchronously retrieves the active producer instance.
   *
   * @returns The active shared {@link Producer} instance.
   * @throws {Error} If `getProducer()` was not called prior to calling this method.
   */
  static getProducerSync(): Producer {
    if (!this.instance) {
      throw new Error(
        "Kafka producer is not connected. Ensure getProducer() is called at startup.",
      );
    }
    return this.instance;
  }

  /**
   * Gracefully disconnects the shared Kafka producer from the broker and resets the cached instance.
   *
   * @param logger - Optional diagnostic logger satisfying {@link LoggerLike}.
   * @returns A promise that resolves when the producer is disconnected.
   */
  static async disconnect(logger?: LoggerLike): Promise<void> {
    if (this.instance) {
      logger?.info(
        { module: "kafka-producer" },
        "Disconnecting Kafka producer...",
      );
      await this.instance.disconnect();
      this.instance = null;
      logger?.info({ module: "kafka-producer" }, "Kafka producer disconnected");
    }
  }
}
