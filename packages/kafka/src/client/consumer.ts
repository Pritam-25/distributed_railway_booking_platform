import { KafkaJS } from "@confluentinc/kafka-javascript";
import type { LoggerLike } from "../consumer-runner/kafka-consumer-runner.js";

type Kafka = KafkaJS.Kafka;
type Consumer = KafkaJS.Consumer;
type ConsumerConfig = KafkaJS.ConsumerConfig;

/**
 * Creates and registers a new Kafka Consumer instance for the specified consumer group.
 *
 * Configures the consumer with `fromBeginning: false` so that it processes newly emitted
 * events rather than replaying historic partition offsets.
 *
 * @param kafka - Initialized {@link Kafka} client instance.
 * @param groupId - Unique identifier representing the consumer group.
 * @param retry - Optional consumer-specific retry parameters matching {@link KafkaJS.RetryOptions}.
 * @param logger - Optional diagnostic logger satisfying {@link LoggerLike}.
 * @returns A newly created {@link Consumer} instance.
 */
export const createConsumer = (
  kafka: Kafka,
  groupId: string,
  retry?: ConsumerConfig["retry"],
  logger?: LoggerLike,
): Consumer => {
  logger?.info(
    { module: "kafka-consumer" },
    `Creating consumer for group: ${groupId}`,
  );

  return kafka.consumer({
    kafkaJS: {
      groupId,
      fromBeginning: false,
      ...(retry ? { retry } : {}),
    },
  });
};
