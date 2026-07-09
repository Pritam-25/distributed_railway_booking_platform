import { redis } from "@config";

/**
 * Health check script executed by Kubernetes exec probes.
 * Validates connectivity to crucial network resources like Redis.
 */
try {
  // Verify Redis connection is active and pingable
  await redis.ping();

  // Exit with 0 to indicate a healthy state
  process.exit(0);
} catch (error) {
  console.error("Health check failed:", error);
  // Exit with a non-zero code to signal unhealthy status to Kubernetes
  process.exit(1);
}
