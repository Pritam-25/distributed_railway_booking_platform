import { KAFKA_TOPICS } from "./topics.js";

export interface TopicDefinition {
  name: string;
  partitions: number;
  replicationFactor: number;
  retentionMs: number;
}

const DEFAULT_PARTITIONS = 1;
const DEFAULT_REPLICATION_FACTOR = 1;
const DEFAULT_RETENTION_MS = 604800000; // 7 days

export const TOPIC_DEFINITIONS: TopicDefinition[] = Object.values(
  KAFKA_TOPICS,
).map((topicName) => ({
  name: topicName,
  partitions: DEFAULT_PARTITIONS,
  replicationFactor: DEFAULT_REPLICATION_FACTOR,
  retentionMs: DEFAULT_RETENTION_MS,
}));
