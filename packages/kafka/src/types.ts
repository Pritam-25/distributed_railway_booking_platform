import { KafkaJS } from "@confluentinc/kafka-javascript";

export const { Kafka: ConfluentKafka, logLevel } = KafkaJS;

/** Confluent Kafka client instance type. */
export type Kafka = KafkaJS.Kafka;

/** Confluent Kafka client configuration options type. */
export type KafkaConfig = KafkaJS.KafkaConfig;

/** Confluent Kafka producer instance type. */
export type Producer = KafkaJS.Producer;

/** Confluent Kafka consumer instance type. */
export type Consumer = KafkaJS.Consumer;

/** Confluent Kafka admin client instance type. */
export type Admin = ReturnType<Kafka["admin"]>;

/** Confluent Kafka message payload received by consumer handlers. */
export type EachMessagePayload = KafkaJS.EachMessagePayload;

/**
 * Structural logger interface compatible with Winston, Pino, Bunyan, and Console.
 */
export interface LoggerLike {
  info(obj: object | string, msg?: string): void;
  warn(obj: object | string, msg?: string): void;
  error(obj: object | string, msg?: string): void;
  debug?(obj: object | string, msg?: string): void;
  fatal?(obj: object | string, msg?: string): void;
}

/**
 * Result structure returned by Kafka health probes matching `@irctc/http`'s `HealthCheckResult`.
 */
export interface KafkaHealthCheckResult {
  ok: boolean;
  latencyMs: number;
  error?: string;
}
