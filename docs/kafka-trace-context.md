Viewed propagation.ts:64-79

Here is the actual step-by-step code path across your repository showing exactly how the trace flows:

---

### Step 1: The HTTP Request is received

When a client hits `POST /api/v1/auth/send-otp` (defined in [auth.routes.ts](file:///d:/dev/distributed_railway_booking_platform/apps/user-service/src/api/v1/routes/auth.routes.ts)), the HTTP instrumentation automatically creates a trace context and sets the active `traceId` (for example: `ab3aa1f8...`).

---

### Step 2: The event is published to Kafka

Inside [otp-requested.publisher.ts](file:///d:/dev/distributed_railway_booking_platform/apps/user-service/src/publishers/otp-requested.publisher.ts#L27-L40), your publisher prepares to send the message:

```typescript
// 1. We call our helper to grab the active trace parent and inject it into the headers object
const headers = injectTraceContextToKafkaHeaders({
  [KAFKA_HEADERS.EVENT_ID]: input.eventId,
  [KAFKA_HEADERS.SCHEMA_VERSION]: SCHEMA_VERSION,
});

// 2. We send the message containing the new trace headers
await this.producer.send({
  topic: KAFKA_TOPICS.USER_OTP_REQUESTED,
  messages: [
    {
      key: input.userId ?? input.eventId,
      value: JSON.stringify(input),
      headers, // <-- Standard traceparent header is now in the Kafka message
    },
  ],
});
```

---

### Step 3: Inside the helper (Trace Injection)

Under the hood, in [propagation.ts](file:///d:/dev/distributed_railway_booking_platform/packages/telemetry/src/propagation.ts#L71-L92), our injection helper writes the trace properties onto the headers carrier object:

```typescript
export function injectTraceContextToKafkaHeaders(
  headers: RawKafkaHeaders = {},
): RawKafkaHeaders {
  const carrier: Record<string, string> = {};

  // propagation.inject looks at the background active context and writes 'traceparent' into the carrier
  propagation.inject(context.active(), carrier);

  return {
    ...headers,
    ...carrier, // <-- Merges { traceparent: '00-ab3aa1f8...' } with your headers
  };
}
```

---

### Step 4: The Consumer receives the message

Downstream in `notification-service`, the message is intercepted by the consumer runner in [kafka-consumer-runner.ts](file:///d:/dev/distributed_railway_booking_platform/packages/kafka/src/consumer-runner/kafka-consumer-runner.ts#L71-L95):

```typescript
eachMessage: async (payload) => {
  const tracer = trace.getTracer("kafka-consumer-runner");

  // 1. We extract the parent context object from the raw Kafka message headers
  const parentCtx = this.propagateTraceContext
    ? extractTraceContextFromKafkaHeaders(payload.message.headers)
    : context.active();

  // 2. We bind the handler function to run inside this active context
  await context.with(parentCtx, () =>
    // 3. We start a child span ('user.otp-requested.v1 process') which inherits the parentCtx
    tracer.startActiveSpan(
      `${payload.topic} process`,
      { kind: SpanKind.CONSUMER },
      async (span) => {
        try {
          await handler(payload); // <-- Runs your consumer logic
        } finally {
          span.end();
        }
      },
    ),
  );
};
```

---

### Step 5: The consumer processes the email

Finally, when the [otp-notification.consumer.ts](file:///d:/dev/distributed_railway_booking_platform/apps/notification-service/src/consumers/otp-notification.consumer.ts#L30-L38) executes the handler logic:

```typescript
private async handle(payload: EachMessagePayload): Promise<void> {
  const { message, heartbeat } = payload;
  if (message.value === null) return;

  const event = JSON.parse(message.value.toString("utf8"));

  // Because this is running inside the active context.with() from Step 4,
  // any log printed here will carry the parent trace ID ("ab3aa1f8..."):
  await this.service.process(event);
}
```

Any trace, error, or logger statement inside `this.service.process(event)` automatically shares the exact same `traceId` (`ab3aa1f8...`), linking the HTTP server actions to the worker actions in Grafana!
