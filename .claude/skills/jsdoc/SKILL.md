---
name: JSDoc
description: Write professional JSDoc / TSDoc for TypeScript source files. Use when adding or revising comments on a function, class, type, or constant — or when the user asks for documentation, "doc this", "add JSDoc", "explain this function", or asks for TypeDoc output. Triggers on any hand-written `.ts`/`.tsx` file under `scripts/`, `apps/*/src/`, `packages/*/src/`.
when_to_use: "Adding or revising JSDoc/TSDoc on a function, class, type, or constant in TypeScript source. Producing documentation that appears in TypeDoc output unchanged."
---

# JSDoc / TSDoc Standard

Write JSDoc / TSDoc that documents **contracts**, **guarantees**, and **domain meaning** — never repeat TypeScript types or obvious code. The TypeScript type already tells the reader the shape; the comment must tell them what the shape means at runtime, what guarantees hold, and what assumptions the caller relies on.

## The Pre-Write Review

Before writing JSDoc on a symbol, perform this review:

1. **Read surrounding code**: What calls this? What does it call? Who imports it?
2. **Understand WHY it exists**: What domain problem it solves.
3. **Determine its contract**: Inputs, outputs, side effects, failure modes, invariants.
4. **Explain guarantees**: Cache strategy, transaction boundaries, retry policy, idempotency, concurrency.
5. **Explain side effects**: Database reads/writes, Redis session mutations, Kafka events emitted.
6. **Explain failure modes**: Specific error codes thrown (`@throws {ApiError}`), return unions, or swallowed errors.

## The 14 Core Rules

### Rule 1 — Never repeat the type

The TS type already says `string`. The comment must describe the domain meaning and constraints.

- ❌ `@param id - string`
- ✅ `@param id - ULID of the authenticated session owner.`

### Rule 2 — Explain WHY, not WHAT

Describe why the code exists and its runtime guarantees, not just a restatement of the function name.

- ❌ `/** Gets user profile. */`
- ✅ `/** Retrieves the user profile, querying Redis cache-aside before PostgreSQL. */`

### Rule 3 — Public exports are fully documented; private helpers only when non-obvious

Public exports must have complete JSDoc. Private helper methods only require JSDoc if they encode non-obvious logic or algorithms.

### Rule 4 — Middleware documents lifecycle, side effects, response guarantees

For any middleware or interceptor:

- **Request lifecycle stage**: Pre-handler / error-handler. Short-circuits on failure.
- **Side effects**: Modifies `req`, sets headers, attaches `req.user`.
- **Response guarantees**: What downstream handlers can rely on having been populated.

### Rule 5 — Service classes & methods use structured TSDoc without redundancy

- **Class-Level JSDoc (`## ServiceName`)**: High-level overview containing `### Responsibilities`, `### Storage & Persistence`, and `### Events Published` for the service module as a whole.
- **Method-Level JSDoc**:
  - **Do NOT repeat** `### Responsibilities` or `### Storage & Persistence` on individual methods if it repeats class-level documentation.
  - Keep the summary line concise and focused on the specific method's domain action.
  - Under `@remarks`, only include method-specific runtime sections when applicable:
    - `### Side Effects` (e.g. Redis key mutated, Kafka event emitted)
    - `### Consistency Guarantees` (e.g. transaction boundary, atomic rollback)
    - `### Failure Guarantees` (e.g. non-fatal Redis cache fallback)
  - If a method has no special side effects, transactions, or failure policies beyond standard execution, **omit `@remarks` entirely** to prevent boilerplate bloat.

```ts
/**
 * Summary of specific method domain action.
 *
 * @remarks
 * ### Failure Guarantees
 * - Redis read/write errors are logged non-fatally and degrade gracefully to PostgreSQL.
 *
 * @param [paramName] - Domain meaning of input parameter.
 * @returns Description of return DTO or domain entity.
 * @throws {ApiError}
 * `ERROR_CODE` — Concise description of failure condition.
 */
```

- **Inline Implementation Comments**: Inside the function body, place 1-line numbered comments (`// 1.`, `// 2.`, `// 3.`) directly above code execution blocks.

### Rule 6 — Repositories document persistence contracts under `@remarks`

Repository classes and methods encapsulate database and search index interactions:

- **Repository Classes**: Header `## [RepositoryName]` and `@remarks` detailing `### Responsibilities` and `### Storage & Persistence` (PostgreSQL tables, Elasticsearch indices, Redis keys).
- **Repository Methods**: Document query execution contracts under `@remarks`:
  - `### Responsibilities`: Query intent, analyzers, or transaction scope.
  - `### Side Effects`: Direct database/search index reads, writes, updates, or deletes.
  - `### Consistency Guarantees`: Explicit `_id` bindings, optimistic locking, or non-fatal error swallowing (e.g. 404 missing-document swallow).
  - `@param`, `@returns`, and `@throws` tags.
- **Inline Implementation Comments**: Place 1-line numbered comments (`// 1.`, `// 2.`) inside method bodies directly above database/index calls.

### Rule 7 — Controllers & Route Modules document HTTP behavior

Controllers translate between HTTP and the service layer:

- **Controller Classes**: Class JSDoc stating architectural responsibilities, injected services (`{@link}`), and global error propagation policy.
- **Controller Methods**: Document HTTP contract using section headers:
  - Route signature: `` `HTTP_METHOD /api/v1/...` ``
  - `### Access`: `Public` | `Authenticated` | `Admin`
  - `### Cookies`: Cookies set or cleared.
  - ❌ Do **NOT** add `@returns` on methods returning `Promise<void>`.
  - ❌ Do **NOT** add `@throws` tags (exceptions propagate to `asyncHandler` / global error middleware).
- **Route modules (`*.routes.ts`)**: Document using a **single top-level JSDoc block** describing routing responsibilities and middleware pipeline (`{@link}`). Do **NOT** write per-route JSDoc blocks (`@route`, `@desc`) above individual `router.get`/`router.post` calls.

### Rule 8 — Examples only when useful

Include `@example` blocks only when they show realistic call sites that clarify non-obvious symbol usage.

### Rule 9 — Use Markdown heavily inside `@remarks`

Use Markdown section headers (`###`) and bullet lists under `@remarks` to organize multi-dimensional contracts cleanly.

### Rule 10 — Use `@remarks` for extended prose

Reserve main summary lines for short descriptions; place structural sections (`Responsibilities`, `Side Effects`, `Consistency Guarantees`) under `@remarks`.

### Rule 11 — Cross-reference with `{@link}`

Always use `{@link Symbol}` to make types clickable in IDE hover cards and TypeDoc output (e.g., `Returns the {@link UserProfile}`).

### Rule 12 — Document contracts, not implementation

Good docs answer: When can this fail? Is it cached? Is it transactional? What state is mutated? What failure guarantees exist?

### Rule 13 — Never document obvious code

Avoid writing "Returns the X" or restating parameter names. If a comment adds no value beyond the TypeScript type signature, omit it.

### Rule 14 — Generated docs read like a README

Ensure JSDoc formatting produces clean, standalone documentation when rendered via TypeDoc.

## Markdown-in-JSDoc Safety

**Never write a literal `*/` inside a JSDoc block.** Block comments end at the first `*/`, so globs like `apps/*/src` close the comment early and produce syntax errors. Rephrase as prose or use placeholders (`apps/<id>/src`).

## Supporting Files

- `examples.md` — Reference examples across architectural layers (Controller, Service, Repository, Middleware, Route Module, Utility).
- `style-guide.md` — Formatting conventions, line-wrap rules, and tag indentation rules.
- `typedoc.md` — Exact TypeDoc/TSDoc tag set and rendering rules.
