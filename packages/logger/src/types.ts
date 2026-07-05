/**
 * Represents structured context information that can be included in log records.
 * `service`: The name of the service initiating the log
 * `userId`: Unique identifier of the user associated with the request
 * `requestId`: Unique ID of the current request, used for log correlation
 * `traceId`: OpenTelemetry Trace ID for distributed tracing context
 * `spanId`: OpenTelemetry Span ID for tracing context
 */
export interface LoggerContext {
  service?: string;
  userId?: string;
  requestId?: string;
  traceId?: string;
  spanId?: string;
}
