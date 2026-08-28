import {
  createHealthRouter,
  checkElasticsearchHealth,
  type HealthDependency,
} from "@irctc/http";
import { checkRedisHealth } from "@irctc/redis";
import { checkKafkaHealth } from "@irctc/kafka";
import { elasticsearch, redis, kafka } from "@config";

/**
 * Dependencies for Kubernetes readiness probes.
 * - elasticsearch: checks the Elasticsearch connection using the search API
 * - redis: checks the Redis connection using the PING command
 * - kafka: checks the Kafka connection by listing topics
 */
const healthDependencies: HealthDependency[] = [
  {
    name: "elasticsearch",
    check: () => checkElasticsearchHealth(elasticsearch),
  },
  { name: "redis", check: () => checkRedisHealth(redis) },
  { name: "kafka", check: () => checkKafkaHealth(kafka) },
];

/**
 * Routes to check the health of the search service.
 */
const healthRoutes = createHealthRouter({
  dependencies: healthDependencies,
});

export default healthRoutes;
