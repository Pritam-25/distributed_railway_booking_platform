# @irctc/telemetry

Centralized OpenTelemetry (OTel) SDK bootstrapping, auto-instrumentation setup, and trace propagation helpers for the IRCTC-style distributed railway booking platform.

## Features

- **Centralized SDK Bootstrapping (`startTelemetry`):** Initializes NodeSDK with standard resources, trace exporters, and samplers.
- **Auto-Instrumentation Configuration:** Enables and configures Node auto-instrumentations (HTTP, Express, pg, etc.) while suppressing noisy traces (e.g. `fs` file operations).
- **Asynchronous Redis Trace Instrumentation:** Couples with `@opentelemetry/instrumentation-ioredis` to ensure Redis queries are correctly traced inside ESM environments.
- **Kafka Context Propagation:** Provides W3C trace context inject/extract helpers (`injectTraceContextToKafkaHeaders`, `extractTraceContextFromKafkaHeaders`) to preserve trace linkage across asynchronous Kafka messaging boundaries.
- **Graceful Telemetry Shutdown (`shutdownTelemetry`):** Flushes pending spans and disconnects the OTLP exporter cleanly during application shutdown.

---

## Directory Structure

```text
packages/telemetry/
├── src/
│   ├── sdk.ts             # OpenTelemetry Node NodeSDK bootstrapper
│   ├── propagation.ts     # Kafka header inject/extract W3C trace context helpers
│   ├── instrumentation.ts # Bootstrap entrypoint loaded via --import at node launch
│   └── index.ts           # Main entry point exports
```

---

## Usage

### 1. Bootstrapping Telemetry at Application Startup (Required)

To capture and instrument all downstream dependencies (Express, HTTP, Redis, Kafka) before they are imported by your application files, you **must** import the telemetry bootstrapper using Node's `--import` flag during process launch.

Run your microservice using:

```bash
node --import @irctc/telemetry/instrumentation dist/server.js
```

In development, you can use `tsx`:

```bash
tsx watch --import @irctc/telemetry/instrumentation ./src/server.ts
```

### 2. Manual SDK Initialisation (for testing or custom entrypoints)

If initializing the SDK manually in your code:

```typescript
import { startTelemetry } from "@irctc/telemetry";

const sdk = startTelemetry({
  serviceName: "booking-service",
  otlpEndpoint: "http://localhost:4318",
  serviceVersion: "1.0.0",
  sampleRatio: 1.0, // Sample 100% of traces
  debug: false,
});
```

### 3. Trace Context Propagation across Kafka

Kafka does not automatically propagate OpenTelemetry trace contexts. You must inject the trace context on the publisher side and extract it on the consumer side:

#### Publisher Side (Inject)

```typescript
import { injectTraceContextToKafkaHeaders } from "@irctc/telemetry";

const headers = injectTraceContextToKafkaHeaders({
  "event-type": "TicketBooked",
});

await producer.send({
  topic: "ticket-booked",
  messages: [{ key: "booking-123", value: JSON.stringify(booking), headers }],
});
```

#### Consumer Side (Extract)

Extract the parent trace context from incoming Kafka headers and run the handler callback within that span context:

```typescript
import { extractTraceContextFromKafkaHeaders } from "@irctc/telemetry";
import { context, trace, SpanKind } from "@opentelemetry/api";

const handleKafkaMessage = async (payload: EachMessagePayload) => {
  const parentContext = extractTraceContextFromKafkaHeaders(
    payload.message.headers,
  );
  const tracer = trace.getTracer("my-consumer");

  // Run the message handler in the parent trace context span
  await context.with(parentContext, () => {
    return tracer.startActiveSpan(
      "process ticket-booked",
      { kind: SpanKind.CONSUMER },
      async (span) => {
        try {
          await processBooking(payload.message.value);
        } finally {
          span.end();
        }
      },
    );
  });
};
```
