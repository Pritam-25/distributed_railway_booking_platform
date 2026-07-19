import { KafkaJS } from "@confluentinc/kafka-javascript";
import { logger } from "@irctc/logger";

type Kafka = KafkaJS.Kafka;
type Consumer = KafkaJS.Consumer;
type ConsumerConfig = KafkaJS.ConsumerConfig;

/**
 * Creates and registers a new Consumer instance for the specified consumer group.
 *
 * @param kafka - The initialized Kafka client instance.
 * @param groupId - The unique identifier representing the consumer group.
 * @param retry - Optional consumer-specific retry configuration parameters.
 * @returns A newly created Consumer instance.
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
  const { factor, multiplier, ...cleanRetry } = (retry || {}) as any;
  return kafka.consumer({
    kafkaJS: {
      groupId,
      fromBeginning: false,
      ...(retry ? { retry: cleanRetry } : {}),
    },
  });
};
