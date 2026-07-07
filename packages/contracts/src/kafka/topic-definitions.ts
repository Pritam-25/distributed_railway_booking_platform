import { TOPICS } from "./topics.js";

export interface TopicDefinition {
  name: string;
  partitions: number;
  replicationFactor: number;
  retentionMs: number;
}

export const TOPIC_DEFINITIONS: TopicDefinition[] = [
  // User OTP Requested
  {
    name: TOPICS.USER_OTP_REQUESTED,
    partitions: 1,
    replicationFactor: 1,
    retentionMs: 604800000, // 7 days
  },
  // User Logged In
  {
    name: TOPICS.USER_LOGGED_IN,
    partitions: 1,
    replicationFactor: 1,
    retentionMs: 604800000, // 7 days
  },
];
