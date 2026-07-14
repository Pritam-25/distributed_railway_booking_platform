import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    PORT: z.string().default("4000"),
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

    CORS_ORIGINS: z
      .string()
      .default("http://localhost:3000")
      .transform((value) =>
        value
          .split(",")
          .map((origin) => origin.trim())
          .filter((origin) => origin.length > 0),
      )
      .refine((origins) => origins.length > 0, {
        message: "CORS_ORIGINS must include at least one origin",
      }),

    // Upstream service URLs — only the services that exist in this
    // monorepo (user + notification). Add a new URL here and a
    // matching entry in `upstreams.ts` for each new service.
    USER_UPSTREAM: z.url().default("http://localhost:4001"),

    JWT_SECRET: z.string().min(1),

    // Rate limiting — `default` bucket for general API traffic,
    // `auth` bucket for credential-bearing endpoints (login, refresh).
    RATE_LIMIT_DEFAULT_CAPACITY: z.coerce
      .number()
      .int()
      .positive()
      .default(100),
    RATE_LIMIT_DEFAULT_REFILL_PER_SEC: z.coerce
      .number()
      .positive()
      .default(1.6667), // 100 tokens / 60s
    RATE_LIMIT_AUTH_CAPACITY: z.coerce.number().int().positive().default(10),
    RATE_LIMIT_AUTH_REFILL_PER_SEC: z.coerce
      .number()
      .positive()
      .default(0.1667), // 10 tokens / 60s

    /** Whether to trust X-Forwarded-* headers (set when behind a proxy). */
    TRUST_PROXY: z.enum(["true", "false"]).default("false"),
    /** Reserved for future OpenAPI/Scalar UI — currently a no-op. */
    SCALAR_ENABLED: z.enum(["true", "false"]).default("false"),

    SERVICE_NAME: z.string().default("api-gateway"),
    OTEL_EXPORTER_OTLP_ENDPOINT: z.url().default("http://localhost:4318"),
    OTEL_DEBUG: z.enum(["true", "false"]).default("true"),
    LOKI_HOST: z.url().optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
