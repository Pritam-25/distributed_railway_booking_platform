import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    PORT: z.coerce.number().int().min(1).max(65535).default(4003),
    GRPC_PORT: z.coerce.number().int().min(1).max(65535).default(50051),
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    DATABASE_URL: z
      .url()
      .refine(
        (u) => u.startsWith("postgres:") || u.startsWith("postgresql:"),
        "DATABASE_URL must be a PostgreSQL connection URL",
      ),
    REDIS_URL: z.url().refine(
      (value) => {
        const protocol = new URL(value).protocol;
        return protocol === "redis:" || protocol === "rediss:";
      },
      {
        message: "REDIS_URL must use redis:// or rediss://",
      },
    ),
    SERVICE_NAME: z.string().default("inventory-service"),
    OTEL_EXPORTER_OTLP_ENDPOINT: z.url().default("http://localhost:4318"),
    OTEL_DEBUG: z.enum(["true", "false"]).default("false"),
    LOKI_HOST: z.url().optional(),
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
    KAFKA_CLIENT_ID: z.string().default("inventory-service"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
