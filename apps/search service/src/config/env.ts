import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    // Server configuration environment
    PORT: z.coerce.number().int().min(1).max(65535).default(4004),
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    SERVICE_NAME: z.string().default("search-service"),

    // Redis configuration environment
    REDIS_URL: z.url().refine(
      (value) => {
        const protocol = new URL(value).protocol;
        return protocol === "redis:" || protocol === "rediss:";
      },
      {
        message: "REDIS_URL must use redis:// or rediss://",
      },
    ),

    // Elasticsearch configuration environment
    ELASTICSEARCH_NODE: z.url().default("http://localhost:9200"),
    ELASTICSEARCH_USERNAME: z.string().default("elastic"),
    ELASTICSEARCH_PASSWORD: z.string().default("password"),

    // Elasticsearch station projection — recreate only for local resets; leave
    // false in production so the existing index survives restarts.
    STATION_INDEX_NAME: z.string().default("stations"),
    STATION_INDEX_RECREATE: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),

    // Kafka configuration environment
    KAFKA_BROKERS: z
      .string()
      .default("localhost:9092")
      .transform((value) =>
        value
          .split(",")
          .map((broker) => broker.trim())
          .filter((broker) => broker.length > 0),
      )
      .refine((brokers) => brokers.length > 0, {
        message: "KAFKA_BROKERS must include at least one broker",
      }),
    KAFKA_CLIENT_ID: z.string().default("search-service"),

    // Inventory configuration environment for service-to-service communication
    INVENTORY_GRPC_URL: z.string().default("localhost:50051"),
    INVENTORY_UPSTREAM: z.url().default("localhost:4003"),

    // Two-phase Redis idempotency for station projection consumers. The
    // processing lease must be longer than the worst-case ES indexing
    // latency; the processed TTL is the dedup window for replayed events.
    IDEMPOTENCY_PROCESSING_LEASE_SECONDS: z.coerce
      .number()
      .int()
      .min(1)
      .default(60),
    IDEMPOTENCY_TTL_SECONDS: z.coerce.number().int().min(1).default(86400),
    IDEMPOTENCY_KEYSPACE: z.string().default("search:station-idempotency"),

    // Suggest-query cache — read-heavy, tolerates a short staleness window.
    SUGGEST_CACHE_TTL_SECONDS: z.coerce.number().int().min(1).default(60),
    SUGGEST_CACHE_KEY_PREFIX: z.string().default("cache:station-suggest"),

    // Telemetry configuration environment
    OTEL_EXPORTER_OTLP_ENDPOINT: z.url().default("http://localhost:4318"),
    OTEL_DEBUG: z.enum(["true", "false"]).default("false"),
    LOKI_HOST: z.url().optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
