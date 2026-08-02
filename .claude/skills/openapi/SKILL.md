---
description: Design, generate, and review OpenAPI specifications for this codebase's Zod → OpenAPI pipeline. Use when the user asks about API contracts, OpenAPI 3.1, Zod-to-OpenAPI registry entries, error envelopes, security schemes, response schemas, operationIds, tags, reusable components, the merged gateway spec, orval SDK generation, the Postman mirror, or contract validation. Triggers on changes under `apps/*/src/openapi/`, `packages/openapi/src/`, `apps/api-gateway/scripts/merge-specs.ts`, `apps/web/scripts/orval-transformer.ts`, and `scripts/services.config.ts`.
when_to_use: "Adding or revising OpenAPI specifications, registry entries, error envelopes, security schemes, response components, or merged gateway output. Reviewing an API contract for missing operationIds, duplicate schemas, inconsistent error responses, or bad examples."
---

# openapi

Design, generate, and review OpenAPI specifications for this codebase's
Zod-source-of-truth pipeline. This skill covers **HTTP API contracts**, not
TypeScript code documentation — for JSDoc/TSDoc on the source files
themselves, see the `jsdoc` skill.

## The pipeline this skill protects

This repository has exactly one source of truth for API contracts:

```
                ┌────────────────────────────────────────────────────┐
                │                                                    │
                │ Zod schema (apps/<svc>/src/dto/, packages/openapi) │
                │                                                    │
                └──────────────────┬─────────────────────────────────┘
                                   │
                                   ▼
                ┌────────────────────────────────────────────────────┐
                │  OpenAPIRegistry per service                       │
                │  apps/<svc>/src/openapi/registry.ts                │
                └──────────────────┬─────────────────────────────────┘
                                   │
                                   ▼
                ┌────────────────────────────────────────────────────┐
                │  apps/<svc>/openapi.yaml                           │
                │  (build:spec task emits both .yaml and .json)      │
                └──────────────────┬─────────────────────────────────┘
                                   │
            ┌──────────────────────┴──────────────────────┐
            │                                             │
            ▼                                             ▼
  apps/api-gateway/openapi.yaml                 postman/specs/<svc>/
  (redocly join, info override)                 (scripts/sync-postman.ts)
            │
            ├──────────────┬──────────────┐
            ▼              ▼              ▼
      apps/web/generated    Scalar UI    contract tests
      (orval, transformer)  (in gateway)
```

Three rules govern everything below:

1. **Zod is the source of truth.** TypeScript interfaces hand-written in
   DTO files are NOT the source. Anything emitted to OpenAPI comes from a
   Zod schema registered with `@irctc/openapi`.
2. **The merged gateway spec is the public contract.** Per-service specs are
   inputs; the gateway output is what consumers see in Postman, Scalar, and
   any SDK or contract test.
3. **Everything else is generated.** Postman collections, Scalar UI, the
   `apps/web/generated/` SDK, contract tests — all derived from the
   gateway spec. If you find yourself hand-editing a generated artefact,
   you are bypassing the pipeline.

## When this skill runs

Trigger on any of:

- "Add an OpenAPI endpoint / schema / response"
- "Document this API"
- "Register this Zod schema in OpenAPI"
- "What does the merged gateway spec look like for X?"
- "Why isn't orval picking up my new endpoint?"
- Contract review for missing operationIds, missing examples, duplicate
  schemas, inconsistent error responses, missing security, missing tags.
- Generating or reviewing `apps/<svc>/openapi.yaml`,
  `apps/api-gateway/openapi.yaml`, or `postman/specs/*/openapi.yaml`.

Do **not** trigger for:

- JSDoc on the source files themselves (use the `jsdoc` skill).
- Runtime validation (Zod schemas are used there too, but the contract
  concern is OpenAPI; the runtime concern is not this skill).
- Postman workspace configuration (`.postman/resources.yaml` is managed by
  Postman Desktop).

## Source of truth — `@irctc/openapi`

Every shared component lives in `packages/openapi/src/`:

- `schemas/`: `ErrorResponseSchema`, `ErrorDetailSchema`, `MetaSchema`,
  `SuccessResponseSchema`, `PaginatedResponseSchema`, `EmptySchema`.
- `responses/`: `createOpenApiResponse`, `ErrorResponses` (full map),
  `CommonErrorResponses` (just 400/429/500).
- `security/`: `bearerAuthScheme`, `cookieAuthScheme`,
  `SecurityRequirements`, `GatewayAuthSecurity`, `registerGatewayAuth`.
- `description.ts`: `buildEndpointDoc` helper for assembling endpoint
  descriptions from `summary`, `overview`, `requestBodyFields`,
  `response`, `outcomes`, `notes`.

When designing a new endpoint or component, **first check whether
`@irctc/openapi` already provides it**. Adding a parallel implementation
breaks the "single source of truth" guarantee.

### Service-side registration pattern

```ts
import {
  OpenAPIRegistry,
  SuccessResponseSchema,
  createOpenApiResponse,
  CommonErrorResponses,
  EmptySchema,
  registerGatewayAuth,
  GatewayAuthSecurity,
  z,
} from "@irctc/openapi";
import { COMMON_ERROR_CODES, COMMON_ERROR_MESSAGES } from "@irctc/errors";

const registry = new OpenAPIRegistry();

// 1. Register shared components first.
registerGatewayAuth(registry);

// 2. Register schemas with descriptive names — these become
//    components.schemas entries in the spec.
registry.register("MyRequest", MyRequestSchema);

// 3. Register paths. Every endpoint:
//    - has an operationId (used by orval, contract tests, and Postman)
//    - belongs to a tag
//    - documents success + common error responses
//    - declares security explicitly (or `security: []` for public endpoints)
registry.registerPath({
  method: "post",
  path: "/api/v1/<domain>/<action>",
  operationId: "domainAction",
  tags: ["Domain"],
  summary: "...",
  description: "...",
  security: GatewayAuthSecurity,
  request: {
    body: { content: { "application/json": { schema: MyRequestSchema } } },
  },
  responses: {
    200: createOpenApiResponse("OK", SuccessResponseSchema(MyResponse, "...")),
    ...CommonErrorResponses,
  },
});
```

## Eight contracts every endpoint must satisfy

Before saving a registry entry, verify each of these. If any answer is
"no", the endpoint is not ready.

1. **operationId is unique across the entire gateway.** Names follow the
   pattern `<tag><action>` (e.g. `usersGetProfile`, `adminLogin`).
2. **Tags belong to a service with `generateSdk` semantics consistent with
   the call site's intent.** Update `scripts/services.config.ts` when adding
   a new tag; the orval transformer reads tags from there to gate SDK
   generation.
3. **Success response uses one of the standard envelopes.**
   `SuccessResponseSchema` for `{ success: true, message, data, meta }`,
   `PaginatedResponseSchema` for paginated lists, `EmptySchema` for 204-style
   no-content successes. **Never invent a new envelope shape.**
4. **Common error responses are spread into every endpoint.** Use
   `...CommonErrorResponses` for 400/429/500, then add endpoint-specific
   status codes (401, 403, 404, 409) with their own
   `createErrorResponseSchema(COMMON_ERROR_CODES.X, COMMON_ERROR_MESSAGES.X)`.
5. **Security is declared explicitly.** `security: GatewayAuthSecurity`
   for cookie-or-Bearer, `security: []` for unauthenticated public
   endpoints, `security: SecurityRequirements.bearerAuth` for
   Bearer-only. **Never omit the `security` field** — the default is
   ambiguous in the merged gateway spec.
6. **Request bodies have `required: true` when the request body is
   non-optional.** A `request: { body: { content: { ... } } }` block
   without `required: true` is silently treated as optional by some
   consumers.
7. **Examples exist on every leaf schema field that an end user might fill
   in.** Use `.openapi({ example: ... })` on the Zod schema. Examples are
   what makes Postman collections and Scalar previews usable.
8. **Endpoint descriptions come from `buildEndpointDoc`.** This ensures the
   `summary`, `overview`, `request body fields`, `response`, `outcomes`,
   and `notes` are rendered consistently across services so the merged
   gateway spec reads as one document, not five.

## Eight contracts every shared component must satisfy

1. **Reused in at least two endpoints or two services.** If it's only used
   once, inline it.
2. **Registered with a stable, descriptive name.** Component names appear
   in `$ref` pointers throughout the spec; rename = cascade.
3. **`ErrorResponse` is the only error envelope.** All per-status variants
   (`BadRequestErrorResponse`, etc.) carry `x-sdk-ref: "ErrorResponse"` so
   the orval transformer in `apps/web/scripts/orval-transformer.ts` can
   collapse them into a single TypeScript type.
4. **Schemas use Zod `.openapi()` for every leaf field that needs an
   example, description, or refId.**
5. **Empty responses use `EmptySchema`, not an ad-hoc `z.object({})`.**
6. **Pagination responses use `PaginatedResponseSchema(itemSchema)`** with
   the item schema as the only argument; never hand-roll a paginated shape.
7. **Error messages live in `@irctc/errors`** as `COMMON_ERROR_CODES` and
   `COMMON_ERROR_MESSAGES`. Don't inline error strings in the registry.
8. **No component carries runtime state.** Components are descriptions, not
   instances. If a runtime helper is needed, it goes in a service file,
   not in `@irctc/openapi`.

## Security scheme conventions

The platform has exactly two security schemes, both registered via
`registerGatewayAuth(registry)`:

- **Bearer JWT** (`type: http, scheme: bearer, bearerFormat: JWT`): for
  programmatic clients (mobile, BFF, service-to-service).
- **HTTP-only cookie** (`type: apiKey, in: cookie, name: access_token`):
  for browser clients.

Two named requirement presets:

- `GatewayAuthSecurity` — either Bearer or cookie; the most common case.
- `SecurityRequirements.bearerAuth` — Bearer only.
- `SecurityRequirements.cookieAuth` — cookie only.

If you find yourself wanting a new scheme (API key, OAuth, mTLS), step back.
The two existing schemes cover every consumer on the platform. Adding a
third scheme means consumers now have to think about which one to use.

## The merged gateway spec

The gateway contract is produced by `apps/api-gateway/scripts/merge-specs.ts`:

1. Discover every service with `publish: true` AND `mergeInput !== false`
   AND a real `openapi.yaml` on disk.
2. Sort by display name (deterministic across machines).
3. Run `redocly join` against the sorted list.
4. Override `info.title`, `info.version`, `info.description` to platform-
   level values so the spec represents the platform, not the first input.
5. Write both YAML and JSON siblings.

When adding a new service to the public contract:

- Add the service to `scripts/services.config.ts` with `publish: true` and
  the tags it emits.
- Add the service to `turbo.json`'s `api-gateway#build:spec.dependsOn` list
  so the per-service spec exists before the merge step.
- Run `pnpm turbo run build:spec` and verify the new service's endpoints
  appear in `apps/api-gateway/openapi.yaml`.

## The Postman mirror

`scripts/sync-postman.ts` mirrors each service's `apps/<id>/openapi.yaml`
into `postman/specs/<displayName>/openapi.yaml`. Read the file header for
the in-place mirror behavior — files are NEVER deleted-and-recreated at
the same path; that triggers Postman's git watcher to register an
absolute-path entry alongside the relative one.

The `.postman/resources.yaml` is managed by Postman Desktop. Do not edit
it directly. If entries are duplicated there, the sync script was likely
run with the old wipe-then-recreate behavior; the current write-then-prune
implementation prevents that.

## The frontend SDK

`apps/web/scripts/orval-transformer.ts` runs as orval's input transformer
on the merged gateway spec. It performs two passes:

1. **Per-service SDK gating.** Reads `scripts/services.config.ts` for
   services with `generateSdk: false` and drops every operation whose
   tags match. The output is `apps/web/generated/endpoints/<tag>/...`.
2. **Error component deduplication.** Per-status error variants carry
   `x-sdk-ref: "ErrorResponse"`; the transformer rewrites `$ref` to those
   variants to point at the single `ErrorResponse` schema.

When adding a new endpoint:

- Make sure its tag is listed in the corresponding service's `tags` array
  in `scripts/services.config.ts`.
- If the endpoint should NOT appear in the frontend SDK, set
  `generateSdk: false` on that service (today only `admin-service`).
- Run `pnpm turbo run generate:api` and verify the new endpoint either
  appears in `apps/web/generated/endpoints/<tag>/` (expected) or is
  correctly absent.

## Contract review checklist

Before merging changes to any registry, run this review. Each item is a
hard requirement, not a style preference.

- [ ] Every operation has a unique `operationId` across the merged gateway.
- [ ] Every operation has at least one tag, and the tag is listed in
      `scripts/services.config.ts` for the service that registered it.
- [ ] Every operation has a non-empty `summary`.
- [ ] Every operation has a `description` built via `buildEndpointDoc` (so
      overview, request body fields, response, outcomes, and notes all
      appear in the rendered doc).
- [ ] Every operation declares `security` explicitly — never omitted.
- [ ] Public endpoints use `security: []` and have it called out in the
      description.
- [ ] Every success response uses a standard envelope
      (`SuccessResponseSchema`, `PaginatedResponseSchema`, or `EmptySchema`).
- [ ] Every operation spreads `CommonErrorResponses` for the universal
      400/429/500 and adds endpoint-specific statuses as needed.
- [ ] Every reused schema is registered as a component (not inlined).
- [ ] Every leaf field that consumers fill in has an `example`.
- [ ] No endpoint carries inline error strings — error codes and messages
      come from `@irctc/errors`.
- [ ] No component is defined for a one-off shape — inline those.
- [ ] `redocly lint` passes locally before committing spec changes.
- [ ] `pnpm turbo run build:spec` produces the expected YAML/JSON without
      diffs in unrelated components.

If any item fails, fix it before asking for review.

## Common mistakes

### "The endpoint is in my service's spec but not the gateway."

The service isn't in `turbo.json`'s `api-gateway#build:spec.dependsOn`
list. Add it.

### "orval is generating duplicate `ErrorResponse` types."

A per-status error variant was registered without
`createErrorResponseSchema(...)`. Use `createErrorResponseSchema` so the
variant carries `x-sdk-ref: "ErrorResponse"` and the orval transformer can
collapse it.

### "Postman is showing two copies of every spec."

`sync-postman.ts` was run with the old wipe-then-recreate behavior. The
current version uses in-place content replacement so this should not
recur. If it does, check that the script's `pruneStaleSpecDirs` is
running after the mirrors, not before.

### "The frontend SDK is missing an endpoint."

The endpoint's tag is registered by a service with `generateSdk: false`.
Either set `generateSdk: true` on that service, or accept the omission as
the intended gating.

### "The merged spec title says 'User Service API'."

`merge-specs.ts` did not run successfully. Check that `pnpm turbo run
api-gateway#build:spec` exits 0; the info override is part of that
script's output.

## Out of scope

This skill does **not** cover:

- Hand-editing `apps/web/generated/**`. The SDK is regenerated by
  `pnpm turbo run generate:api`. Edit the source (Zod schemas, registry)
  instead.
- Hand-editing `apps/*/openapi.{json,yaml}`. Those are regenerated by
  `pnpm turbo run build:spec`. Edit `apps/<svc>/src/openapi/registry.ts`.
- Hand-editing `.postman/resources.yaml` or `.postman/workflows.yaml`.
  Those are managed by Postman Desktop.
- Runtime concerns (Zod validation in the request/response pipeline, error
  envelopes in HTTP responses). Those are `@irctc/http` and
  `@irctc/errors` territory.
- JSDoc on the source files. Use the `jsdoc` skill.

## Supporting files

- `pipeline.md` — the build pipeline in detail: each script's role, the
  artifacts produced, and the regeneration chain.
- `schemas.md` — the standard envelope shapes (success, error, pagination,
  empty) and when to use each.
- `security.md` — the two security schemes, the named requirement presets,
  and when to use each.
- `review-checklist.md` — the contract review checklist expanded into
  per-line guidance.

Load these on demand. Do not paste their contents into `SKILL.md`.
