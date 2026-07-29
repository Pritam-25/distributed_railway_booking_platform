/**
 * Public surface of @irctc/kafka.
 *
 * Folder layout:
 *   client/         — Kafka client + producer/consumer factories
 *   consumer-runner/ — generic Consumer wrapper with run(topic, handler)
 *   retry/          — RetryPolicy factories
 *   headers/        — Kafka header names + DLQ reason enums
 */
export * from "./client/index.js";
export * from "./consumer-runner/index.js";
export * from "./retry/index.js";
export * from "./headers/index.js";
export * from "./outbox/index.js";
import { KafkaJS } from "@confluentinc/kafka-javascript";
export type Kafka = KafkaJS.Kafka;
export type Producer = KafkaJS.Producer;
export type Consumer = KafkaJS.Consumer;
export type EachMessagePayload = KafkaJS.EachMessagePayload;
