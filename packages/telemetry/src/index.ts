/**
 * @irctc/telemetry
 *
 * Provides OpenTelemetry SDK bootstrapping. Each microservice calls {@link startTelemetry}
 * once at boot time to register auto-instrumentations.
 *
 * Operational Caveats:
 * - Active spans are automatically read by `@irctc/logger` to inject trace metadata.
 * - Kafka consumers must call `extractTraceContextFromKafkaHeaders` (from `propagation.ts`)
 *   to propagate the parent context downstream.
 */

export * from "./sdk.js";
export * from "./propagation.js";
export { type Context } from "@opentelemetry/api";
