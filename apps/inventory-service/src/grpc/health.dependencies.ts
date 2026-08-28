import type { GrpcHealthDependency } from "@irctc/grpc";
import { checkDatabaseHealth } from "@irctc/http";
import { checkRedisHealth } from "@irctc/redis";
import { checkKafkaHealth } from "@irctc/kafka";
import { prisma, redis, kafka } from "@config";

export const healthDependencies: GrpcHealthDependency[] = [
  { name: "database", check: () => checkDatabaseHealth(prisma) },
  { name: "redis", check: () => checkRedisHealth(redis) },
  { name: "kafka", check: () => checkKafkaHealth(kafka) },
];
