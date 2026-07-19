import { KafkaJS } from "@confluentinc/kafka-javascript";
import { logger } from "@irctc/logger";

const { Kafka: ConfluentKafka, logLevel } = KafkaJS;
type Kafka = KafkaJS.Kafka;
type KafkaConfig = KafkaJS.KafkaConfig;

/**
 * Creates and initializes a Kafka client instance.
 *
 * It merges caller-supplied options (such as SSL, SASL credentials, timeouts,
 * and custom log creators) with predefined infrastructure defaults under the `kafkaJS` configuration block.
 *
 * @param config - Optional configuration overrides to merge with client defaults.
 * @returns An initialized Kafka client instance.
 */
export const createKafkaClient = (config: Partial<KafkaConfig> = {}): Kafka => {
  const { factor, multiplier, ...cleanRetry } = (config.retry || {}) as any;
  // Merge user config, providing default values for standard fields
  const kafkaJSConfig: KafkaConfig = {
    ...config,
    clientId: config.clientId ?? "irctc-service",
    brokers: config.brokers ?? ["localhost:9092"],
    retry: {
      initialRetryTime: 100,
      retries: 8,
      ...cleanRetry,
    },
    logLevel: config.logLevel ?? logLevel.NOTHING,
  };

  const kafka = new ConfluentKafka({
    kafkaJS: kafkaJSConfig,
  });
  logger.info({ module: "kafka-client" }, "Kafka client initialized");
  return kafka;
};
