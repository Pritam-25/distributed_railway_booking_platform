import { startTelemetry } from "./index.js";

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

const serviceName = process.env.SERVICE_NAME?.trim() || "unknown-service";

const otlpEndpoint =
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim() || "http://localhost:4318";

startTelemetry({
  serviceName,
  otlpEndpoint,
  debug: process.env.OTEL_DEBUG === "true",
});
