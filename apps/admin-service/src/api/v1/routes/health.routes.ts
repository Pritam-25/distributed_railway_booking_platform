import {
  createHealthRouter,
  checkDatabaseHealth,
  type HealthDependency,
} from "@irctc/http";
import { checkKafkaHealth } from "@irctc/kafka";
import { prisma, kafka } from "@config";

/**
 * Dependencies for Kubernetes readiness probes.
 * - database: checks the database connection using Prisma's $queryRaw
 * - kafka: checks the Kafka connection by listing topics
 */
const healthDependencies: HealthDependency[] = [
  { name: "database", check: () => checkDatabaseHealth(prisma) },
  { name: "kafka", check: () => checkKafkaHealth(kafka) },
];

/**
 * Routes to check the health of the admin service.
 */
const healthRoutes = createHealthRouter({
  dependencies: healthDependencies,
});

export default healthRoutes;
