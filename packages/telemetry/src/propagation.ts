import { context, propagation, type Context } from "@opentelemetry/api";

/**
 * Raw KafkaJS header format matching kafkajs' IHeaders structure.
 */
export type RawKafkaHeaders = Record<
  string,
  string | Buffer | (string | Buffer)[] | undefined
>;

/**
 * Flat string record mapping header keys to normalized string values.
 */
export type NormalizedKafkaHeaders = Record<string, string>;

/**
 * Normalizes raw KafkaJS headers into a flat string record.
 *
 * @param headers Kafka message headers (raw format).
 * @returns Headers normalized to string key-value pairs.
 *
 * @remarks
 * Preprocesses headers before OpenTelemetry context extraction.
 * Converts all header values to strings and ensures keys are normalized for consistent lookup.
 */
export function normaliseKafkaHeaders(
  headers: unknown,
): NormalizedKafkaHeaders {
  if (!headers || typeof headers !== "object") return {};

  const out: NormalizedKafkaHeaders = {};
  for (const [rawKey, rawValue] of Object.entries(
    headers as Record<string, unknown>,
  )) {
    const key = rawKey.toLowerCase();
    if (rawValue == null) continue;

    if (Array.isArray(rawValue)) {
      const values = rawValue
        .map((v) =>
          (Buffer.isBuffer(v) ? v.toString("utf8") : String(v)).trim(),
        )
        .filter(Boolean);
      if (values.length === 0) continue;
      out[key] = key === "traceparent" ? (values[0] ?? "") : values.join(",");
      continue;
    }

    out[key] = Buffer.isBuffer(rawValue)
      ? rawValue.toString("utf8")
      : String(rawValue);
  }
  return out;
}

/**
 * Extracts W3C trace context from incoming Kafka message headers.
 *
 * @param headers Kafka message headers (raw format).
 * @returns The extracted OpenTelemetry trace context.
 *
 * @remarks
 * Extracts parent trace metadata (e.g. traceparent) from consumed messages.
 * Normalizes raw message headers to lowercase string key-value pairs, then extracts the OpenTelemetry trace context using the standard W3C propagator.
 */
export function extractTraceContextFromKafkaHeaders(headers: unknown): Context {
  const normalised = normaliseKafkaHeaders(headers);
  return propagation.extract(context.active(), normalised);
}

/**
 * Injects the active tracing context into outgoing Kafka message headers.
 *
 * @param headers Kafka message headers (raw format).
 * @returns The Kafka message headers with injected trace context.
 *
 * @remarks
 * Propagates the active trace context downstream across a Kafka boundary.
 * Reads the active OpenTelemetry span context, serializes it into a temporary W3C trace header map, and merges it back into the outgoing message headers.
 */
export function injectTraceContextToKafkaHeaders(
  headers: RawKafkaHeaders = {},
): RawKafkaHeaders {
  const carrier: Record<string, string> = {};
  propagation.inject(context.active(), carrier);

  return {
    ...headers,
    ...carrier,
  };
}
