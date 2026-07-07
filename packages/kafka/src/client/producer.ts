import { Kafka, Producer } from "kafkajs";
import { logger } from "@irctc/logger";

/**
 * Singleton manager class for creating, caching, and retrieving the shared Kafka Producer instance.
 *
 * It configures standard reliability patterns such as idempotency and auto-topic creation prevention.
 */
export class KafkaProducerManager {
  private static instance: Producer | null = null;

  /**
   * Initializes and returns the shared Kafka Producer instance.
   *
   * If an active instance already exists, it will be returned immediately.
   * The connection to the Kafka broker is established before storing the instance,
   * ensuring that `isConnected()` only returns true when the connection is live.
   *
   * @param kafka - The initialized Kafka client instance.
   * @returns A promise resolving to the initialized and connected Kafka Producer.
   */
  static async getProducer(kafka: Kafka): Promise<Producer> {
    if (this.instance) return this.instance;

    logger.info({ module: "kafka-producer" }, "Initializing Kafka producer...");

    const producer = kafka.producer({
      allowAutoTopicCreation: false,
      idempotent: true,
      maxInFlightRequests: 5,
    });

    // Establish broker connection before exposing the instance.
    await producer.connect();
    this.instance = producer;

    logger.info(
      { module: "kafka-producer" },
      "Kafka producer connected successfully",
    );
    return this.instance;
  }

  /**
   * Checks whether the shared producer instance has been successfully initialized and connected.
   *
   * @returns True if the producer is connected, false otherwise.
   */
  static isConnected(): boolean {
    return this.instance !== null;
  }

  /**
   * Synchronously retrieves the active producer instance.
   *
   * @returns The active Kafka Producer.
   * @throws {Error} If the producer has not been connected at startup.
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
   * @returns A promise that resolves when the producer is disconnected.
   */
  static async disconnect(): Promise<void> {
    if (this.instance) {
      logger.info(
        { module: "kafka-producer" },
        "Disconnecting Kafka producer...",
      );
      await this.instance.disconnect();
      this.instance = null;
      logger.info({ module: "kafka-producer" }, "Kafka producer disconnected");
    }
  }
}
