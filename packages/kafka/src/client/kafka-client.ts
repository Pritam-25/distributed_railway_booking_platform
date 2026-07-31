import { KafkaJS } from "@confluentinc/kafka-javascript";
import type { LoggerLike } from "../consumer-runner/kafka-consumer-runner.js";

const { Kafka: ConfluentKafka, logLevel } = KafkaJS;
type Kafka = KafkaJS.Kafka;
type KafkaConfig = KafkaJS.KafkaConfig;

/**
 * Creates and initializes a Kafka client instance.
 *
 * Merges caller-supplied configuration options with infrastructure defaults under
 * the `kafkaJS` nested configuration block required by `@confluentinc/kafka-javascript`.
 *
 * @param config - Optional configuration overrides to merge over default settings.
 * @param logger - Optional diagnostic logger satisfying {@link LoggerLike}.
 * @returns An initialized {@link Kafka} client instance.
 */
export const createKafkaClient = (
  config: Partial<KafkaConfig> = {},
  logger?: LoggerLike,
): Kafka => {
  // Merge user config, providing default values for standard fields
  const kafkaJSConfig: KafkaConfig = {
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

  const kafka = new ConfluentKafka({
    kafkaJS: kafkaJSConfig,
  });
  logger?.info({ module: "kafka-client" }, "Kafka client initialized");
  return kafka;
};
