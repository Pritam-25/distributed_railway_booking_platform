import { context, trace } from "@opentelemetry/api";

/**
 * Retrieves trace id from the active OpenTelemetry span context.
 * @returns Trace id.
 */
export const getTraceId = (): string | undefined => {
  const span = trace.getSpan(context.active());
  return span?.spanContext().traceId;
};

export default getTraceId;
