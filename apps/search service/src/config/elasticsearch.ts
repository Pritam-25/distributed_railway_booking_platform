import { Client } from "@elastic/elasticsearch";
import { env } from "@config";
import { logger } from "@irctc/logger";

const globalForElastic = globalThis as {
  elasticsearch?: Client;
};

/**
 * Singleton ElasticSearch client instance exported for application-wide use.
 * Reuses the existing client cached on the global scope during development hot-reloads.
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
 * Ensures ElasticSearch is connected and ready to process commands.
 * This is critical for production bootstrap to avoid race conditions.
 *
 * @returns A promise that resolves when the ElasticSearch client status is 'ready'.
 * @throws {Error} - If the connection times out or encounters an error.
 */
export const initElasticsearch = async (): Promise<void> => {
  try {
    logger.info(
      { module: "elasticsearch", node: env.ELASTICSEARCH_NODE },
      "Initializing Elasticsearch client connection ping...",
    );
    const info = await elasticsearch.info();
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
 * Gracefully terminates the active ElasticSearch client connection channels.
 * Recommended for use in shutdown hooks to ensure clean application exit.
 *
 * @returns A promise that resolves when the client successfully disconnects.
 */
export const disconnectElasticsearch = async (): Promise<void> => {
  logger.info({ module: "elasticsearch" }, "Closing Elasticsearch client");

  await elasticsearch.close();
};
