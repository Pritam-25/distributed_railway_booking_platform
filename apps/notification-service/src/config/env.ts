import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    PORT: z.string().default("4002"),
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    REDIS_URL: z.url().refine(
      (value) => {
        const protocol = new URL(value).protocol;
        return protocol === "redis:" || protocol === "rediss:";
      },
      {
        message: "REDIS_URL must use redis:// or rediss://",
      },
    ),
    SERVICE_NAME: z.string().default("notification-service"),
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
    KAFKA_CLIENT_ID: z.string().default("notification-service"),
    SENDGRID_API_KEY: z.string().default("SG.mock_key"),
    SENDGRID_SENDER: z.email().default("no-reply@example.com"),
    OTP_TTL_SECONDS: z.coerce.number().int().positive().default(300),
    WELCOME_TTL_SECONDS: z.coerce.number().int().positive().default(3600),

    IDEMPOTENCY_TTL_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(7 * 24 * 60 * 60), // 7 days
    IDEMPOTENCY_PROCESSING_LEASE_SECONDS: z.coerce
      .number()
      .int()
      .positive()
      .default(300), // in-flight lease; must exceed worst-case send + retry window
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
