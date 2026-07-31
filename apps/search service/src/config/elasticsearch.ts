import { Client } from "@elastic/elasticsearch";
import { env } from "@config";
import { logger } from "@irctc/logger";

/**
 * `globalForElastic` is used to store the `Elasticsearch` client in the global scope.
 *
 * This is necessary because the `Elasticsearch` client is a **singleton** and should not be recreated
 * during hot-reloads in development.
 */
const globalForElastic = globalThis as {
  elasticsearch?: Client;
};

/**
 * Singleton `Elasticsearch` client instance used application-wide.
 *
 * @remarks
 * ### Responsibilities
 * - Manages HTTP connection pool to `Elasticsearch` cluster.
 * - Caches client instance on global object during local development hot-reloads to prevent connection leaks.
 */
export const elasticsearch =
  globalForElastic.elasticsearch ??
  new Client({
    node: env.ELASTICSEARCH_NODE,
    auth: {
      username: env.ELASTICSEARCH_USERNAME,
      password: env.ELASTICSEARCH_PASSWORD,
    },
  });

/**
 * Verifies `Elasticsearch` cluster connection at application bootstrap.
 *
 * @remarks
 * ### Responsibilities
 * - Issues `client.info()` ping to fail fast if `Elasticsearch` is unreachable.
 * - Logs cluster name and node version for environment diagnostic checks.
 *
 * ### Side Effects
 * - **Elasticsearch**: One network round-trip request to node info endpoint.
 *
 * ### Failure Guarantees
 * - Rethrows transport error so application bootstrap fails fast and initiates process exit.
 * @throws {Error} If `Elasticsearch` cluster node is unreachable or rejects auth.
 */
export const initElasticsearch = async (): Promise<void> => {
  try {
    // 1. Issue ping request to Elasticsearch cluster node
    logger.info(
      { module: "elasticsearch", node: env.ELASTICSEARCH_NODE },
      "Initializing Elasticsearch client connection ping...",
    );
    const info = await elasticsearch.info();

    // 2. Log cluster connection details on success
    logger.info(
      {
        module: "elasticsearch",
        version: info.version.number,
        cluster: info.cluster_name,
      },
      "Connected to Elasticsearch",
    );
  } catch (error) {
    logger.error(
      { module: "elasticsearch", error },
      "Elasticsearch connection failed",
    );
    throw error;
  }
};

// Cache instance on global scope during local development hot-reloads
if (env.NODE_ENV !== "production") {
  globalForElastic.elasticsearch = elasticsearch;
}

/**
 * Gracefully closes the `Elasticsearch` client and releases its connection pool.
 *
 * @remarks
 * ### Responsibilities
 * - Closes open HTTP connection pool during server shutdown.
 *
 * ### Side Effects
 * - **Elasticsearch**: Releases connection sockets.
 */
export const disconnectElasticsearch = async (): Promise<void> => {
  // 1. Close Elasticsearch client connection pool
  logger.info({ module: "elasticsearch" }, "Closing Elasticsearch client");
  await elasticsearch.close();
};
