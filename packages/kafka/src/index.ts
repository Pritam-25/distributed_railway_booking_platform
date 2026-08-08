export * from "./client/index.js";
export * from "./consumer-runner/index.js";
export * from "./retry/index.js";
export * from "./headers/index.js";
export * from "./outbox/index.js";
import { KafkaJS } from "@confluentinc/kafka-javascript";

/** Exported types from `KafkaJS` client instance. */
export type Kafka = KafkaJS.Kafka;

/** Exported types from `KafkaJS` producer instance. */
export type Producer = KafkaJS.Producer;

/** Exported types from `KafkaJS` consumer instance. */
export type Consumer = KafkaJS.Consumer;

/** Exported types from `KafkaJS` each message payload. */
export type EachMessagePayload = KafkaJS.EachMessagePayload;
