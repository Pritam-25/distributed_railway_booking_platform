import { startTelemetry } from "./index.js";
import { createRequire } from "node:module";

/**
 * OpenTelemetry bootstrap entrypoint.
 *
 * This module MUST be loaded via `node --import` BEFORE any application
 * code, so that auto-instrumentations can monkey-patch http, express,
 * ioredis, kafkajs, etc. before they are first imported.
 *
 * Usage:
 *   node --import @irctc/telemetry/instrumentation dist/server.js
 */

// Synchronously load dotenv configuration in development environments
try {
  const require = createRequire(import.meta.url);
  require("dotenv").config();
} catch (e) {
  // In production/Docker containers, dotenv might not be installed;
  // we gracefully fall back to pre-injected OS environment variables.
  if (!(e instanceof Error && (e as any).code === "MODULE_NOT_FOUND")) {
    throw e;
  }
}

const serviceName = process.env.SERVICE_NAME?.trim() || "unknown-service";

const otlpEndpoint =
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim() || "http://localhost:4318";

startTelemetry({
  serviceName,
  otlpEndpoint,
  debug: process.env.OTEL_DEBUG === "true",
});
