import { Kafka, KafkaConfig, logLevel } from "kafkajs";
import { logger } from "@irctc/logger";

/**
 * Creates and initializes a KafkaJS client instance.
 *
 * It merges caller-supplied options (such as SSL, SASL credentials, timeouts,
 * and custom log creators) with predefined infrastructure defaults.
 *
 * @param config - Optional configuration overrides to merge with client defaults.
 * @returns An initialized Kafka client instance.
 */
export const createKafkaClient = (config: Partial<KafkaConfig> = {}): Kafka => {
  // Merge user config, providing default values for standard fields
  const finalConfig: KafkaConfig = {
    ...config,
    clientId: config.clientId ?? "irctc-service",
    brokers: config.brokers ?? ["localhost:9092"],
    retry: {
      initialRetryTime: 100,
      retries: 8,
      ...config.retry,
    },
    logLevel: config.logLevel ?? logLevel.NOTHING,
  };

  const kafka = new Kafka(finalConfig);
  logger.info({ module: "kafka-client" }, "Kafka client initialized");
  return kafka;
};
