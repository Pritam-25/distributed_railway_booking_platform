# Schemas — Standard Envelopes and Components

Reference for every shared schema in `packages/openapi/src/schemas/` and
the response envelope pattern. Load this file when deciding which envelope
to use, or when designing a new shared component.

## The four envelopes

Every endpoint returns one of four envelope shapes. **Never invent a
fifth.**

### 1. Success envelope — `SuccessResponseSchema(data, message)`

Shape:

```yaml
success: true
message: "Operation completed successfully"
data: <DataT>
meta: <ResponseMeta>
```

Use for endpoints that return a single resource.

```ts
import { SuccessResponseSchema, EmptySchema } from "@irctc/openapi";

registry.registerPath({
  // ...
  responses: {
    200: createOpenApiResponse(
      "User profile retrieved",
      SuccessResponseSchema(UserResponseSchema, "Profile retrieved"),
    ),
  },
});
```

For endpoints that succeed without returning data (logout, send-OTP, etc.):

```ts
SuccessResponseSchema(EmptySchema, "Logged out successfully");
```

`EmptySchema` is `{ }` — an empty object. Never use it directly as the
schema; always wrap it via `SuccessResponseSchema` so the success envelope
shape is preserved.

### 2. Paginated envelope — `PaginatedResponseSchema(itemSchema, message?)`

Shape:

```yaml
success: true
message: "Items retrieved successfully"
data: [<ItemT>, <ItemT>, ...]
meta:
  requestId: "01J..."
  timestamp: "2026-07-29T10:30:00Z"
  total: 100
  page: 1
  limit: 10
  totalPages: 10
```

Use for endpoints that return lists with pagination metadata.

```ts
import { PaginatedResponseSchema } from "@irctc/openapi";

registry.registerPath({
  // ...
  responses: {
    200: createOpenApiResponse(
      "Active sessions",
      PaginatedResponseSchema(SessionSummarySchema, "Sessions retrieved"),
    ),
  },
});
```

The `meta` field extends `MetaSchema` with `total`, `page`, `limit`, and
`totalPages` so a single `$ref` to the base metadata is preserved alongside
the pagination markers.

### 3. Error envelope — `ErrorResponseSchema` (shared)

Shape:

```yaml
success: false
error:
  code: "INVALID_INPUT"
  message: "Invalid Request Input."
  details: <unknown>
meta: <ResponseMeta>
```

There is **exactly one** error envelope in the platform. Per-status
variants (`BadRequestErrorResponse`, `UnauthorizedErrorResponse`, etc.) all
have the same shape; they exist as named components so each status code
carries its own description in the spec. The orval transformer collapses
them into the single `ErrorResponse` reference at SDK-generation time.

```ts
import {
  createOpenApiResponse,
  createErrorResponseSchema,
  CommonErrorResponses,
} from "@irctc/openapi";
import { COMMON_ERROR_CODES, COMMON_ERROR_MESSAGES } from "@irctc/errors";

registry.registerPath({
  // ...
  responses: {
    200: createOpenApiResponse("OK", SuccessResponseSchema(MyData, "...")),
    // Spread the standard 400/429/500 set.
    ...CommonErrorResponses,
    // Add endpoint-specific statuses.
    401: createOpenApiResponse(
      "Invalid credentials",
      createErrorResponseSchema(
        COMMON_ERROR_CODES.UNAUTHORIZED,
        COMMON_ERROR_MESSAGES.UNAUTHORIZED,
      ),
    ),
    404: createOpenApiResponse(
      "Resource not found",
      createErrorResponseSchema(
        COMMON_ERROR_CODES.NOT_FOUND,
        COMMON_ERROR_MESSAGES.NOT_FOUND,
      ),
    ),
  },
});
```

The `createErrorResponseSchema(code, message, schemaName?)` helper:

- If `schemaName` is provided, the variant is registered as a named
  component (e.g. `BadRequestErrorResponse`). Use named variants only when
  the status code needs its own description that differs from the generic.
- If `schemaName` is omitted, the variant is inlined in the response.
  Use inlined variants for endpoint-specific statuses where a named
  component is overkill.

### 4. Empty response (204-style)

When the endpoint succeeds but the response body is meaningless
(uncommon in this codebase — `SuccessResponseSchema(EmptySchema)` is
preferred), use `EmptySchema` directly:

```ts
import { EmptySchema } from "@irctc/openapi";

registry.registerPath({
  // ...
  responses: {
    204: createOpenApiResponse("No content", EmptySchema),
  },
});
```

## Shared components

| Component                  | Definition                                | Use case                                        |
| :------------------------- | :---------------------------------------- | :---------------------------------------------- |
| `MetaSchema`               | `{ requestId, timestamp }`                | Every envelope carries one.                     |
| `PaginationMetadataSchema` | `{ total, page, limit, totalPages }`      | Embedded in paginated responses via `extend()`. |
| `SuccessResponseSchema`    | Factory wrapping `data` + `message`       | Single-resource success responses.              |
| `PaginatedResponseSchema`  | Factory wrapping `itemSchema` + `message` | List responses.                                 |
| `EmptySchema`              | `{}`                                      | For `data` fields that carry no payload.        |
| `ErrorResponseSchema`      | The unified error envelope                | Always referenced via `$ref` or `x-sdk-ref`.    |
| `ErrorDetailSchema`        | `{ code, message, details? }`             | The `error` block in `ErrorResponseSchema`.     |

## When to inline vs. when to register a component

**Inline** (use the schema directly in `responses`):

- The shape is used in exactly one endpoint.
- The shape has no name and shouldn't appear in `$ref` pointers.

**Register as a component** (call `registry.register("Name", schema)`):

- The shape is reused across two or more endpoints.
- The shape is referenced from a request body and a response (so a
  consumer can navigate from response → request via the same `$ref`).
- The shape is part of a public contract that downstream SDKs should
  name explicitly (orval produces a TypeScript type from each component).

## When to introduce a new shared component

Before adding a new component to `packages/openapi/src/schemas/`, check:

1. Is the shape reused across at least two services? If only one service
   uses it, the component belongs in that service's registry, not in
   `@irctc/openapi`.
2. Is the shape's name stable? Renaming a shared component is a breaking
   change because it appears in `$ref` pointers and SDK TypeScript types.
3. Is the shape's contract clear enough to document? A component with a
   one-line description is a candidate for inlining; a component with a
   paragraph of contract is a candidate for sharing.

If all three hold, propose the addition with the same review process as
any other change to `@irctc/openapi`: file header, JSDoc on the factory,
example use, and a CHANGELOG-style note in the component description.

## Examples

### Anti-pattern: ad-hoc envelope

```ts
// ❌ Invented a new envelope shape.
registry.registerPath({
  // ...
  responses: {
    200: {
      description: "OK",
      content: {
        "application/json": {
          schema: z.object({
            ok: z.literal(true),
            payload: UserSchema,
          }),
        },
      },
    },
  },
});
```

This bypasses the standard envelope. Consumers now have to special-case
the response shape for this endpoint. Replace with
`SuccessResponseSchema(UserSchema, "...")`.

### Anti-pattern: error variant without `x-sdk-ref`

```ts
// ❌ Per-status variant registered as a schema but missing the marker.
const BadRequestErrorResponse = z.object({
  success: z.literal(false),
  error: ErrorDetailSchema,
  meta: MetaSchema,
});
registry.register("BadRequestErrorResponse", BadRequestErrorResponse);
```

The orval transformer can't detect this variant as an error envelope, so
it generates a duplicate `BadRequestErrorResponse.ts` file per endpoint
that references it. Use `createErrorResponseSchema` from
`@irctc/openapi` to get the marker for free.

### Anti-pattern: inline error envelope

```ts
// ❌ Inline envelope without going through the standard shape.
responses: {
  400: {
    description: "Bad Request",
    content: {
      "application/json": {
        schema: z.object({
          success: z.literal(false),
          error: z.object({ code: z.string(), message: z.string() }),
        }),
      },
    },
  },
}
```

Replace with:

```ts
import { createOpenApiResponse, createErrorResponseSchema } from "@irctc/openapi";

responses: {
  400: createOpenApiResponse(
    "Bad Request - Validation or invalid input error",
    createErrorResponseSchema(
      COMMON_ERROR_CODES.INVALID_INPUT,
      COMMON_ERROR_MESSAGES.INVALID_INPUT,
    ),
  ),
}
```
