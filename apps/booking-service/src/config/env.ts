import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    PORT: z.coerce.number().int().min(1).max(65535).default(4004),

    INVENTORY_GRPC_URL: z.string().default("localhost:50051"),
    PAYMENT_GRPC_URL: z.string().default("localhost:50052"),
    GRPC_INTERNAL_AUTH_TOKEN: z
      .string()
      .min(32, "GRPC_INTERNAL_AUTH_TOKEN must be at least 32 characters"),
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
    SEAT_HOLD_TTL_MS: z.coerce.number().int().default(600000),
    SERVICE_NAME: z.string().default("booking-service"),
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

    /**
     * TTL for the Redis idempotency `PROCESSING` lease held while a
     * consumer is working on a saga-reply event. Must exceed the worst-case
     * orchestrator handler duration; if it expires while a consumer is
     * still running, a Kafka redelivery can double-process. The default
     * 60s is well above the saga-reply handler's < 5s typical duration.
     */
    SAGA_IDEMPOTENCY_PROCESSING_LEASE_SEC: z.coerce
      .number()
      .int()
      .min(5)
      .max(600)
      .default(60),

    /**
     * TTL for the Redis idempotency `PROCESSED` marker kept after a saga
     * reply has been handled. The marker exists to dedupe Kafka
     * redeliveries; 7 days matches the broker retention default.
     */
    SAGA_IDEMPOTENCY_PROCESSED_TTL_SEC: z.coerce
      .number()
      .int()
      .min(60)
      .max(2592000)
      .default(604800),

    /**
     * Keyspace prefix for booking-service saga-reply idempotency keys.
     * Keeps the booking-service namespace distinct from any other Redis
     * idempotency keys (notification-service uses its own).
     */
    SAGA_IDEMPOTENCY_KEYSPACE: z.string().default("booking-service:saga"),

    /**
     * Deadline (ms) for the synchronous `inventory.ValidateBooking` gRPC
     * pre-flight called from BookingService.createBooking. Must be lower
     * than the api-gateway request timeout. The default 3s matches the
     * underlying gRPC client's `defaultTimeoutMs`.
     */
    BOOKING_VALIDATE_DEADLINE_MS: z.coerce
      .number()
      .int()
      .min(100)
      .max(10000)
      .default(3000),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
