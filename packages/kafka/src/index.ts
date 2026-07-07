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
export type { Kafka, Producer } from "kafkajs";
