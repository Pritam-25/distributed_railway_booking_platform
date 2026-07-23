import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    PORT: z.coerce.number().int().min(1).max(65535).default(4002),
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    DATABASE_URL: z
      .url()
      .refine(
        (u) => u.startsWith("postgres:") || u.startsWith("postgresql:"),
        "DATABASE_URL must be a PostgreSQL connection URL",
      ),
    JWT_SECRET: z.string().min(1),
    JWT_EXPIRATION_TIME: z
      .enum(["15m", "30m", "1h", "1d", "7d", "30d"])
      .default("7d"),
    ADMIN_EMAIL: z.email(),
    ADMIN_PASSWORD: z.string().min(8),
    SERVICE_NAME: z.string().default("admin-service"),
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
    KAFKA_CLIENT_ID: z.string().default("admin-service"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
