# Review Checklist — Per-Item Guidance

Expanded version of the contract review checklist in `SKILL.md`. Each
item gets a paragraph of "what to look for", "how to fix", and "why this
matters" so the review is mechanical rather than judgmental.

## 1. operationId is unique across the merged gateway

**What to look for.** Every `operationId` value across
`apps/<svc>/openapi.yaml` files. Two endpoints with the same
`operationId` will collide in the merged gateway spec, and orval will
emit only one of them — silently dropping the other.

**How to fix.** Rename the duplicate to match the convention
`<tag><action>` (e.g. `usersGetProfile`, `adminLogin`,
`bookingCreateReservation`). If the operationId is used by a frontend
SDK call, search `apps/web/` for the call site and update it as well.

**Why this matters.** operationIds are how the SDK generates function
names and how contract tests reference endpoints. A collision means one
endpoint's tests run against the other endpoint's URL.

## 2. Tag is registered in `services.config.ts`

**What to look for.** Every `tags: ["..."]` value in every
`registry.registerPath(...)` call. The tag must appear in the
`tags: [...]` array of the service's entry in `scripts/services.config.ts`.

**How to fix.** If a tag is missing, add it to the service's entry. If
the tag is a brand-new domain (not a rename of an existing tag), make
sure the service's `displayName` and `publish` flag are also correct.

**Why this matters.** The orval transformer reads the `tags` arrays to
decide which operations to drop based on `generateSdk`. A tag that's not
listed in any service entry has no explicit gating decision and is
treated as SDK-eligible by default — which may or may not be the
intended behavior. Listing it explicitly removes the ambiguity.

## 3. operationId is unique across the merged gateway

(Continued from #1 — operationId uniqueness is the single most common
breaking-change source. Worth checking twice.)

## 4. Summary is non-empty

**What to look for.** Every `summary` field on every registered path.
Empty or whitespace-only summaries produce blank entries in Postman and
Scalar.

**How to fix.** Replace with a one-line imperative summary that fits the
endpoint's purpose, e.g. "Send OTP for user registration", "Retrieve
the authenticated user's profile", "Revoke an active session".

**Why this matters.** Summaries are the first thing a consumer sees in
the Postman collection and the Scalar UI. A blank summary is the
hallmark of a half-finished registration.

## 5. Description uses `buildEndpointDoc`

**What to look for.** Every `description` field is built via
`buildEndpointDoc({ summary, overview, requestBodyFields, response,
outcomes, notes })` and the rendered string includes the standard
sections (overview, request body fields, response, outcomes, optionally
notes).

**How to fix.** Refactor any hand-written description to use
`buildEndpointDoc`. Pull the prose from the hand-written description
into the `overview` and `response` fields, and move the per-status-code
list into `outcomes`.

**Why this matters.** `buildEndpointDoc` ensures every endpoint renders
identically across services. Without it, the merged gateway spec reads
as five separate documents glued together instead of one unified
contract.

## 6. Security is declared explicitly

**What to look for.** Every registered path has a `security` field —
either `GatewayAuthSecurity`, `SecurityRequirements.bearerAuth`,
`SecurityRequirements.cookieAuth`, or `[]`.

**How to fix.** Add the missing field. If the endpoint is authenticated,
default to `GatewayAuthSecurity`. If it's public, declare `security: []`
explicitly.

**Why this matters.** Tools that consume the spec (Postman, Scalar,
contract tests, orval) all rely on the explicit declaration. Omitting
the field gives ambiguous defaults.

## 7. Success response uses a standard envelope

**What to look for.** Every 2xx response has a schema built from
`SuccessResponseSchema`, `PaginatedResponseSchema`, or `EmptySchema`. No
ad-hoc envelope shapes.

**How to fix.** Replace any custom envelope with the appropriate
standard one. If the endpoint really does need a custom envelope
(extremely rare), the change must go into `packages/openapi/src/schemas/`
and be reviewed as a new shared component.

**Why this matters.** The frontend SDK's response parser handles one
envelope shape. Ad-hoc envelopes force every consumer to special-case
the response, defeating the point of having a typed contract.

## 8. Common error responses are spread

**What to look for.** Every authenticated endpoint spreads
`...CommonErrorResponses` to pick up 400/429/500. Endpoint-specific
status codes (401, 403, 404, 409) are added as separate keys.

**How to fix.** Add the spread. If a 401 is needed, add it after the
spread so it overrides any default.

**Why this matters.** Common error responses are how consumers know
that 400 means validation failure, 429 means rate-limited, and 500 means
server error. Omitting them makes consumers guess at what each status
means.

## 9. Reused schemas are registered as components

**What to look for.** Any schema that's referenced from more than one
endpoint or one request + one response is registered as a named
component in `components.schemas`. No duplicated inline shapes.

**How to fix.** Register the shape once with `registry.register("Name",
schema)`, then reference it from both endpoints via `$ref`.

**Why this matters.** Duplicated shapes break the SDK generation: orval
emits a TypeScript type per `components.schemas` entry, but two inline
shapes with the same structure produce two different type names.
Consumers then can't pass an object of one type to a function expecting
the other.

## 10. Examples exist on leaf fields

**What to look for.** Every leaf field that a consumer fills in has an
`example` set via `.openapi({ example: ... })` on the Zod schema.
Required fields are checked first; optional fields that are commonly
filled in are checked second.

**How to fix.** Add `.openapi({ example: <realistic value> })` to the
Zod schema definition.

**Why this matters.** Examples are what makes Postman collections and
Scalar previews usable. Without them, the consumer sees a field with no
clue what value to put there.

## 11. No inline error strings

**What to look for.** No error string is hard-coded in a registry
entry. Every error code and message comes from `@irctc/errors` as
`COMMON_ERROR_CODES.X` and `COMMON_ERROR_MESSAGES.X`.

**How to fix.** Replace the inline string with the appropriate constant
from `@irctc/errors`. If the error is genuinely new, add it to
`@irctc/errors` first (with the code and message), then reference it.

**Why this matters.** Error codes and messages are surfaced to end users
via the frontend. Hard-coded strings are a localization and consistency
nightmare — `@irctc/errors` is the single source of truth.

## 12. No component for a one-off shape

**What to look for.** Any component in `components.schemas` that's
referenced exactly once. If it's only used in one place, it should be
inlined.

**How to fix.** Move the schema definition from `registry.register(...)`
back into the endpoint that uses it. If the schema is reused across
two endpoints in the future, register it then.

**Why this matters.** Components that exist for no reason clutter the
spec and confuse consumers (who assume every component is part of the
public contract). Inline-only schemas also produce nicer SDK types
because the response type is named after the endpoint, not after an
internal helper.

## 13. `redocly lint` passes locally

**What to look for.** Run `pnpm exec redocly lint <spec-path>` against
the merged gateway spec and every per-service spec. No errors.

**How to fix.** Address each lint rule violation per the redocly
recommendations. The platform's lint config lives in
`redocly.config.yaml` (or `redocly.yaml`) if one exists; otherwise, the
default ruleset applies.

**Why this matters.** Lint catches subtle spec mistakes that humans miss
— missing `operationId`, malformed `$ref`, ambiguous `oneOf` vs `anyOf`,
nullable misuse. Catching them at PR time is cheaper than catching them
when a consumer reports a broken integration.

## 14. `pnpm turbo run build:spec` produces no unexpected diffs

**What to look for.** After running `pnpm turbo run build:spec`,
`git diff apps/<svc>/openapi.yaml` should show only the expected
changes. Unrelated components (other endpoints, other schemas) should
not change.

**How to fix.** Investigate any unexpected diff. The most common cause
is a shared component (in `packages/openapi/src/`) changing shape — a
change there propagates to every per-service spec.

**Why this matters.** Unexpected diffs make code review harder (the
reviewer has to determine whether each diff is intentional) and signal
that the source-of-truth change is broader than it appears.

## How to run this review

The full review takes about 10–15 minutes per service registry. For
smaller changes (a single new endpoint, a single new schema), narrow the
review to the affected file. For larger changes (a new shared component,
a new service, a refactor across services), run the full review.

```bash
# Per-service spec regeneration.
pnpm turbo run <svc>#build:spec

# Merged gateway spec regeneration.
pnpm turbo run api-gateway#build:spec

# Lint the merged spec.
pnpm exec redocly lint apps/api-gateway/openapi.yaml

# SDK regeneration (to verify the transformer picks up the new endpoint).
pnpm turbo run generate:api

# Postman mirror (to verify the new endpoint shows up).
pnpm docs

# TypeScript check on the frontend SDK.
pnpm --filter web typecheck
```

If any step fails, fix the issue and re-run from the top. The pipeline
is order-sensitive — fixing one step without re-running the downstream
steps leaves the artifacts out of sync.
