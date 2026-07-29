---
description: Write professional JSDoc / TSDoc for TypeScript source files. Use when adding or revising comments on a function, class, type, or constant — or when the user asks for documentation, "doc this", "add JSDoc", "explain this function", or asks for TypeDoc output. Triggers on any hand-written `.ts`/`.tsx` file under `scripts/`, `apps/*/src/`, `packages/*/src/`, or `apps/web/lib/`. Does NOT apply to generated artefacts under `apps/web/generated/**` or `apps/*/openapi.{json,yaml}`.
when_to_use: "Adding or revising JSDoc/TSDoc on a function, class, type, or constant in TypeScript source. Producing documentation that could appear in TypeDoc output unchanged."
---

# jsdoc

Write JSDoc / TSDoc that documents **contracts**, not **types**. The TypeScript
type already tells the reader the shape; the comment must tell them what the
shape means at runtime, what guarantees hold, and what assumptions the caller
relies on.

This skill is for **hand-written source files** in this repository. Generated
artefacts (`apps/web/generated/**`, regenerated `openapi.{json,yaml}`, etc.)
inherit their documentation from the producer that emits them — do not add
JSDoc to generated files by hand.

## When this skill runs

Trigger on any of:

- "Add JSDoc to this function / class / module"
- "Document this file"
- "Explain this code"
- "What should the TypeDoc for this look like?"
- Adding JSDoc to a new export during code authoring

Do **not** trigger for:

- Generated files (orval output, OpenAPI YAML, etc.)
- Comments inside test fixtures
- README prose unrelated to a symbol's contract
- The `openapi` skill's territory (HTTP API contracts live there)

## The pre-write review

Before writing a single line of JSDoc, perform this review on the symbol being
documented. Skipping it produces restatements of the type.

1. **Read the surrounding code.** What calls this? What does it call? Who
   imports it?
2. **Understand WHY it exists.** Not "what it does" — what problem it solves
   that nothing else solves. If the answer is "it's a wrapper", consider
   whether the wrapper is necessary before documenting it.
3. **Determine its contract.** Inputs, outputs, side effects, failure modes,
   invariants the caller can rely on.
4. **Ignore obvious implementation.** Don't narrate the algorithm unless the
   algorithm IS the contract (e.g. a sort function whose stability matters).
5. **Explain guarantees.** Cache strategy, transaction boundaries, retry
   policy, idempotency, concurrency, ordering, freshness.
6. **Explain caller expectations.** What must the caller have already done?
   What can the caller do after this returns?
7. **Explain side effects.** Mutates? Emits? Writes to disk? Sends a message?
   Logs?
8. **Explain failure modes.** Throws? Returns error union? Returns `null`?
   Retries internally? Bubbles up a wrapped error?
9. **Examples only when beneficial.** Never `add(1, 2)`. Always a realistic
   call site that shows the contract in action.
10. **Produce documentation that could appear in TypeDoc without modification.**

If you cannot answer #5–#8, you do not yet understand the symbol. Re-read the
code or ask the user. **Do not write speculative documentation.**

## The 14 rules

These are not style preferences. They are the contract this skill enforces.
Numbered for reference in code review.

### Rule 1 — Never repeat the type

The TS type already says `string`. The comment must say _what_ the string
represents and _what constraints_ the caller must satisfy.

❌ `@param id - string`
✅ `@param id - ULID of the authenticated user; never null for a verified session.`

If the parameter is named such that the description would only repeat the
type (e.g. `count: number`), describe the **domain meaning** instead: `Number
of seats available; never negative; reflects current inventory as of the
request timestamp`.

### Rule 2 — Explain WHY, not WHAT

❌ `/** Gets profile. */`
✅ ```
/**

- Retrieves the authenticated user's profile.
-
- Uses Redis as a cache-aside layer before querying PostgreSQL. A cache miss
- adds ~10ms; a cache hit serves in <1ms. The cache TTL is 5 minutes and is
- invalidated on profile update.
  */

```

### Rule 3 — Public exports are fully documented; private helpers only when the algorithm isn't obvious

If a private function has an obvious body (3 lines of trivial mapping), skip
the JSDoc. If the private function encodes a non-obvious invariant (e.g. a
collision-resolution strategy), document it.

### Rule 4 — Middleware documents lifecycle, side effects, errors, response guarantees

For any middleware or interceptor:

```

- Request lifecycle stage: pre-handler / handler / error-handler
- Side effects: modifies req, sets headers, opens transactions, allocates
- Error behavior: rethrows, transforms, swallows (and when)
- Response guarantees: what the downstream handler can rely on having been
  populated on req

````

### Rule 5 — Services document cache strategy, transaction boundaries, retries, idempotency, concurrency

These five attributes are the contract of any service-level function. Even
when the function is a one-liner, the comment must say which of these apply.

### Rule 6 — Repositories document persistence guarantees, optimistic locking, transactions

Repository functions are where the persistence contract lives. If the
repository uses optimistic locking, the function comment must say so. If it
runs in a transaction, say which scope.

### Rule 7 — Controllers document HTTP behavior, never business logic

Controllers translate between HTTP and the service layer. Document the HTTP
contract: status codes, content negotiation, headers, auth requirements.
Business logic belongs in the service layer's docs, not the controller's.

### Rule 8 — Examples only when useful

❌ `add(1, 2)` — useless example
✅ ```
@example
await authService.refreshSession(req.cookies.refreshToken);
````

Examples should show the realistic call site, not the toy case.

### Rule 9 — Use Markdown heavily

Section headers inside JSDoc are valid TSDoc. Use them for structure when the
comment has more than a summary.

```
@remarks

## Cache Strategy

Read-through Redis cache, 5-minute TTL.

## Failure Modes

Throws ServiceUnavailable if Redis is unreachable after 3 retries.
```

### Rule 10 — Use `@remarks` for extended prose

```
/**
 * Refreshes the user's session.
 *
 * @remarks
 * Reads the refresh token from the cookie, rotates the access/refresh pair,
 * and rewrites the cookies. Does NOT touch the database — token rotation is
 * stateless.
 *
 * @param refreshToken - Hex-encoded refresh JWT from the cookie.
 * @returns The new session metadata including the rotated tokens.
 * @throws {InvalidTokenError} If the refresh token is malformed or expired.
 */
```

### Rule 11 — Cross-reference with `{@link}`

❌ "Returns the User object."
✅ "Returns the {@link User} profile."

Inline `{@link}` makes the symbol clickable in TypeDoc, IDE hover, and
rendered docs. Use it instead of repeating the type name as text.

### Rule 12 — Document contracts, not implementation

Good docs answer:

- When can this fail?
- Is it thread-safe?
- Is it cached?
- Is it transactional?
- Is it idempotent?
- What assumptions does the caller rely on?
- What state is mutated?

A doc comment that answers none of these is probably restating the type.

### Rule 13 — Never document obvious code

❌ `/** Returns the user. */`
✅ ```
/**

- Returns the authenticated user associated with the active session.
-
- @throws {SessionExpiredError} If the session has expired.
  */

```

If you find yourself writing "Returns the X", stop and ask whether the
description is adding information beyond the type signature. If not, the
comment is dead weight.

### Rule 14 — Generated docs read like a README

The format below is the target output for any non-trivial public export. It
maps directly to TypeDoc sections and renders identically when extracted.

```

## [Symbol Name]

[One-line summary.]

### Responsibilities

- [What it does, bullet by bullet.]
- [Each bullet is a sentence, not a noun.]

### Side Effects

- [Filesystem, network, mutations, emissions.]

### Errors

[When it throws / returns errors. What errors, when.]

### Remarks

[Design rationale, trade-offs, invariants, why this exists.]

````

## File header — every hand-written source file

Every file starts with a JSDoc block covering:

1. **Purpose** of the file
2. **Responsibilities** (what this file owns vs. what it delegates)
3. **How it fits into the architecture** (which layer, which pipeline step)
4. **Important design decisions** (with the WHY)
5. **Related files** when the relationship is non-obvious

Example for a build script:

```ts
/**
 * Mirrors generated OpenAPI specifications into the Postman Native Git
 * workspace.
 *
 * Source of truth: apps/<id>/openapi.yaml. This script does not communicate
 * with Postman Cloud; publishing happens via the Postman Desktop app or CLI.
 */
````

## Markdown-in-JSDoc safety

**Never write a literal `*/` inside a JSDoc block.** Block comments end at
the first `*/`, so paths like `apps/*/openapi.yaml` or globs like `*.ts`
close the comment early and produce cascading syntax errors. Rephrase as
prose, escape the slash (`app&#x2F;s`), or use a placeholder (`<id>`).

This is a footgun that has bitten this repo already — see commit history.

## Output standard

Before declaring the doc done, verify:

- [ ] The summary says WHY this exists, not WHAT it does.
- [ ] Every `@param` describes domain meaning, not the type.
- [ ] `@returns` describes the contract of the return value, not its shape.
- [ ] `@throws` lists the specific errors and when they occur.
- [ ] Side effects are listed explicitly.
- [ ] Cross-references use `{@link}`.
- [ ] No literal `*/` appears inside the block.
- [ ] If `pnpm docs` (TypeDoc) ran on this file, the rendered output would
      befit a README section.

## Supporting files

- `examples.md` — annotated real-world examples taken from this codebase.
- `style-guide.md` — formatting conventions, line-wrap rules, Markdown
  inside JSDoc, TypeDoc output fidelity.
- `typedoc.md` — the exact TypeDoc/TSDoc tag set and how each tag renders.

Load these on demand. Do not paste their contents into `SKILL.md`.
