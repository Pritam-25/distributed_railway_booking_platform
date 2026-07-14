import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    PORT: z.string().default("4002"),
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
    DATABASE_URL: z.url(),
    REDIS_URL: z.url().refine(
      (value) => {
        const protocol = new URL(value).protocol;
        return protocol === "redis:" || protocol === "rediss:";
      },
      {
        message: "REDIS_URL must use redis:// or rediss://",
      },
    ),
    JWT_SECRET: z.string().min(1),
    JWT_ACCESS_EXPIRES_IN: z.enum(["15m", "30m", "1h", "1d"]).default("15m"),
    JWT_REFRESH_EXPIRES_IN: z.enum(["7d", "30d"]).default("7d"),
    REGISTRATION_OTP_TTL: z.coerce.number().int().positive().default(300), // 5 minutes in seconds
    FORGOT_PASSWORD_OTP_TTL: z.coerce.number().int().positive().default(600), // 10 minutes in seconds
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
