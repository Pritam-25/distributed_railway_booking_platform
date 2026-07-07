import { Kafka, Consumer, ConsumerConfig } from "kafkajs";
import { logger } from "@irctc/logger";

/**
 * Creates and registers a new KafkaJS Consumer instance for the specified consumer group.
 *
 * @param kafka - The initialized Kafka client instance.
 * @param groupId - The unique identifier representing the consumer group.
 * @param retry - Optional consumer-specific retry configuration parameters.
 * @returns A newly created KafkaJS Consumer instance.
 */
export const createConsumer = (
  kafka: Kafka,
  groupId: string,
  retry?: ConsumerConfig["retry"],
): Consumer => {
  logger.info(
    { module: "kafka-consumer" },
    `Creating consumer for group: ${groupId}`,
  );
  return kafka.consumer(retry ? { groupId, retry } : { groupId });
};
