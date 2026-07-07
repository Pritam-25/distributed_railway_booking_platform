/**
 * Trace context propagation across Kafka message boundaries.
 *
 * Producers: the `@opentelemetry/instrumentation-kafkajs` package writes the
 * W3C `traceparent` / `tracestate` headers automatically as part of the
 * `kafka.publish` span. Producer code does NOT need to inject anything.
 *
 * Consumers: kafkajs' auto-instrumentation does NOT automatically resume the
 * parent context inside the message handler. Each consumer-runner MUST call
 * {@link extractTraceContextFromKafkaHeaders} and `context.with(...)` the
 * result around the handler invocation. That's the only place manual
 * propagation is needed in this package.
 */
import { context, propagation, type Context } from "@opentelemetry/api";

/**
 * Normalised Kafka headers. KafkaJS hands consumer `EachMessagePayload`
 * headers as `IHeaders`, which is `Buffer | string | (Buffer | string)[]` per
 * key. This helper collapses any of those shapes into a plain `string` map
 * so the W3C propagator can read it.
 */
export type KafkaHeaderMap = Record<string, string>;

/**
 * Convert raw KafkaJS headers to a flat string map. Multi-valued headers are
 * joined with `,` — we never expect that for `traceparent` / `tracestate`,
 * but a deterministic join is safer than dropping the second value silently.
 *
 * @param headers - The `message.headers` from an `EachMessagePayload`.
 * @returns A flat `Record<string, string>` safe to pass to the propagator.
 */
export function normaliseKafkaHeaders(headers: unknown): KafkaHeaderMap {
  if (!headers || typeof headers !== "object") return {};

  const out: KafkaHeaderMap = {};
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
 * Extract the W3C trace context that the producer wrote into Kafka message
 * headers and return an OTel `Context` ready to be re-attached to the
 * current async context. The caller is responsible for wrapping the message
 * handler in `context.with(ctx, () => handler(payload))`.
 *
 * @param headers - Raw `message.headers` from an `EachMessagePayload`.
 * @returns The extracted context, or the current active context if no
 *          `traceparent` header is present (cold message, e.g. a replay).
 */
export function extractTraceContextFromKafkaHeaders(headers: unknown): Context {
  const normalised = normaliseKafkaHeaders(headers);
  const extracted = propagation.extract(context.active(), normalised);
  return extracted;
}

/**
 * Convenience helper to extract the trace context and construct the child span name.
 * The caller is responsible for starting and activating the child CONSUMER span using the
 * returned context and span name (e.g., via context.with/tracer.startSpan).
 *
 * Why this exists: Separating parent context extraction from the actual span creation
 * allows the consumer runner to apply the correct tracer/span kind.
 *
 * @param headers - Raw `message.headers` from an `EachMessagePayload`.
 * @param topic   - The Kafka topic. Becomes the span name's suffix.
 * @returns The extracted context and computed span name.
 */
export function buildConsumerSpanContext(
  headers: unknown,
  topic: string,
): { ctx: Context; spanName: string } {
  const ctx = extractTraceContextFromKafkaHeaders(headers);
  // We don't actually start the span here — we hand the caller a context
  // that already carries the parent, and a name to use when they do. The
  // runner is the only place that knows the right sampler / span kind.
  return { ctx, spanName: `${topic} process` };
}
