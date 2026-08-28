import {
  createHealthRouter,
  checkDatabaseHealth,
  type HealthDependency,
} from "@irctc/http";
import { checkRedisHealth } from "@irctc/redis";
import { checkKafkaHealth } from "@irctc/kafka";
import { prisma, redis, kafka } from "@config";

/**
 * Dependencies for Kubernetes readiness probes.
 * - database: checks the database connection using Prisma's $queryRaw
 * - redis: checks the Redis connection using the PING command
 * - kafka: checks the Kafka connection by listing topics
 */
const healthDependencies: HealthDependency[] = [
  { name: "database", check: () => checkDatabaseHealth(prisma) },
  { name: "redis", check: () => checkRedisHealth(redis) },
  { name: "kafka", check: () => checkKafkaHealth(kafka) },
];

/**
 * Routes to check the health of the user service.
 */
const healthRoutes = createHealthRouter({
  dependencies: healthDependencies,
});

export default healthRoutes;
