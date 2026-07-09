import pino, { Logger } from "pino";
import { context, trace } from "@opentelemetry/api";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { REDACT_PATHS } from "./constants.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Service name used to identify the application in log entries.
 * Defaults to "unknown-service" if SERVICE_NAME environment variable is not set.
 */
const serviceName = process.env.SERVICE_NAME ?? "unknown-service";

const isProduction = process.env.NODE_ENV === "production";

/**
 * Logger level config. Production defaults to "info", others to "debug" for verbose output.
 */
const logLevel = isProduction ? "info" : "debug";

/**
 * Pino transport options.
 * In development, uses a custom pretty-printing transport located in `transport.js`.
 * In production, writes raw JSON logs to standard output for efficient log shippers.
 */
const transportOption = isProduction
  ? undefined
  : {
      target: path.resolve(__dirname, "transport.js"),
      options: {
        ignore:
          "pid,hostname,service,module,statusCode,durationMs,method,path,requestId,traceId,spanId,remoteAddress,message",
        singleLine: true,
      },
    };

/**
 * Core Pino Logger instance for the application.
 * Configured with:
 * - PII Redaction: Masks sensitive keys specified in `REDACT_PATHS`
 * - OpenTelemetry integration: Mixes active trace and span IDs into log entries
 * - Formatters: Standardizes level labels
 * - Dev Transport: Pretty prints logs locally
 */
export const logger: Logger = pino({
  level: logLevel,

  redact: {
    paths: REDACT_PATHS,
    censor: "[REDACTED]",
  },

  base: {
    service: serviceName,
  },

  messageKey: "message",

  formatters: {
    level(label: string) {
      return { level: label };
    },
  },

  /**
   * Mixes tracing context from OpenTelemetry into log records.
   * If there is an active OTel span, returns traceId and spanId to correlate logs with traces.
   */
  mixin() {
    const currentSpan = trace.getSpan(context.active());

    if (!currentSpan) {
      return {};
    }

    const spanContext = currentSpan.spanContext();

    return {
      traceId: spanContext.traceId,
      spanId: spanContext.spanId,
    };
  },

  transport: transportOption,
});
