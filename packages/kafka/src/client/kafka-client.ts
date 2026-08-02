import { KafkaJS } from "@confluentinc/kafka-javascript";
import type { LoggerLike } from "../consumer-runner/kafka-consumer-runner.js";

const { Kafka: ConfluentKafka, logLevel } = KafkaJS;
type Kafka = KafkaJS.Kafka;
type KafkaConfig = KafkaJS.KafkaConfig;

export type CreateKafkaClientOptions = Omit<Partial<KafkaConfig>, "logger"> & {
  logger?: LoggerLike;
};

/**
 * Creates and initializes a Kafka client instance.
 *
 * Merges caller-supplied configuration options with infrastructure defaults under
 * the `kafkaJS` nested configuration block required by `@confluentinc/kafka-javascript`.
 *
 * @param options - Configuration options or overrides (accepts `logger` as {@link LoggerLike}).
 * @param loggerParam - Optional diagnostic logger satisfying {@link LoggerLike}.
 * @returns An initialized {@link Kafka} client instance.
 */
export const createKafkaClient = (
  options: CreateKafkaClientOptions = {},
  loggerParam?: LoggerLike,
): Kafka => {
  const { logger: loggerFromOptions, ...config } = options;
  const logger = loggerParam ?? loggerFromOptions;

  // Merge user config, providing default values for standard fields
  const kafkaJSConfig: KafkaConfig = {
    ...config,
    clientId: config.clientId ?? "irctc-service",
    brokers: config.brokers ?? ["localhost:9092"],
    connectionTimeout: config.connectionTimeout ?? 10_000,
    requestTimeout: config.requestTimeout ?? 30_000,
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
