# TypeDoc / TSDoc Tag Reference

The exact tags TypeDoc and TSDoc recognize and how each renders. Use this
file as a lookup when choosing a tag — do not paste it into JSDoc.

## Standard tags

### `@param`

Documents a function parameter.

```
@param name - Description that says WHY this parameter exists, not what type it is.
```

Rules:

- One tag per parameter.
- Hyphen separator (`name - description`).
- Description explains domain meaning, constraints, and caller expectations
  — not the type.
- `@param name T` is not a TSDoc pattern; the type comes from the function
  signature, not the comment.

### `@typeParam` (TSDoc) / `@template` (JSDoc)

Documents a generic type parameter. Prefer `@typeParam` in TypeScript code
(TSDoc) because it's the standardized tag; `@template` is the legacy JSDoc
form.

```
@typeParam T - The entity type. Must be a {@link z.ZodTypeAny}.
```

### `@returns`

Documents the return value. Use prose, not a restatement of the type.

```
@returns The user's profile, including the timestamps and preferences.
@returns `null` when no active session exists.
@returns A promise that resolves with the paginated list on success and
  rejects with {@link QueryError} on database failure.
```

### `@throws`

Lists the specific errors a function can throw and the conditions under
which each occurs.

```
@throws {InvalidTokenError} When the refresh token is malformed.
@throws {SessionExpiredError} When the access token TTL has elapsed.
```

Avoid: `@throws {Error}`. That's not documentation.

### `@remarks`

Extended prose after the summary. Rendered as the "Remarks" section in
TypeDoc. Use this for:

- Long-form context that doesn't fit in a one-line summary.
- Design rationale, trade-offs, why-this-and-not-that.
- Grouped sub-sections (with Markdown headings) for cache strategy, retry
  policy, etc.

```
@remarks

## Cache Strategy

Read-through Redis cache with a 5-minute TTL.

## Failure Modes

Throws when the underlying database is unavailable for more than 30s.
```

`@remarks` is the only tag that should contain Markdown headings.

### `@privateRemarks`

Internal-only commentary that TypeDoc strips from public output. Use this
for "what we considered and rejected" notes that future maintainers need
but consumers don't.

### `@example`

Code samples. Prefer realistic call sites.

```
@example
const profile = await userService.getProfile('01J5D...');
```

A single `@example` block can be multi-line. Use fenced code blocks for
anything longer than a one-liner:

````
@example
```ts
const profile = await userService.getProfile('01J5D...');
console.log(profile.firstName);
````

```

### `@defaultValue`

The default value of a property or parameter.

```

@defaultValue 300

```

### `@deprecated`

Marks a symbol as deprecated. Always pair with a migration hint.

```

@deprecated Use {@link newFunction} instead. Will be removed in v2.

```

### `@see`

Pointer to related symbols or external docs.

```

@see {@link AuthService.refreshSession}
@see https://tools.ietf.org/html/rfc7519

```

### `@link` (inline)

Inline cross-reference. Use it in prose, not as a section.

```

Returns the {@link User} profile.
Throws {@link SessionExpiredError} on expiry.

```

Label override with the pipe-separated form: `{@link Symbol | descriptive label}`.

### `@inheritDoc`

Inherit documentation from a parent class or interface implementation.

```

/** @inheritDoc */

```

Use sparingly — explicit docs almost always beat inheritance when the child
genuinely has different behavior.

### `@internal`

Marks a symbol as internal — TypeDoc excludes it from generated output.
Use this for symbols exported only because TypeScript's module system
requires it but never intended for external consumption.

```

/** @internal */
export const _decodeToken = (token: string) => { ... };

```

### `@alpha` / `@beta` / `@experimental`

Release-lifecycle stage tags. Use `@beta` for new public APIs that may
change, `@experimental` for early prototyping.

### `@sealed` / `@virtual` / `@override`

Class-inheritance contract tags. `@sealed` means no subclassing,
`@virtual` means subclassing is expected, `@override` annotates an override.

### `@readonly`

Marks a property as read-only. Usually redundant with the TS `readonly`
keyword, but useful when the API surface is described in a separate file.

### `@packageDocumentation`

This codebase does not use `@packageDocumentation`. File-level JSDoc blocks
are not required by the skill; route files, barrels, and DTO modules are
documented by their names. If you find yourself wanting it, the right answer
is usually to delete the comment block entirely.

### `@eventProperty`

Documents a property of an event type.

## Tags this skill does NOT use

The following tags are valid but rarely useful in this codebase. Prefer
the alternatives listed.

| Tag                  | Why avoid                                                              |
| :------------------- | :--------------------------------------------------------------------- |
| `@author`            | Git blame provides this; do not duplicate.                             |
| `@version`           | Git tags provide this; do not duplicate.                               |
| `@license` / `@copyright` | Goes in a separate header comment, not JSDoc.                      |
| `@constant`          | The `const` keyword says this; redundant.                              |
| `@constructor`       | The `constructor` keyword says this; redundant.                       |
| `@enum`              | Use a TypeScript `enum` declaration; the keyword implies it.           |
| `@global`            | Module-system artifact; not a documentation concern.                   |
| `@memberOf`          | Use module-level scoping; do not embed paths in JSDoc.                |
| `@module` / `@namespace` | Use ES module declarations; not a documentation concern.            |

## Cross-reference cheat sheet

| Reference kind         | Syntax                                | Example                                       |
| :--------------------- | :------------------------------------ | :-------------------------------------------- |
| Local symbol           | `{@link Symbol}`                      | `{@link User}`                                |
| Local symbol with label | `{@link Symbol \| label}`            | `{@link UserService \| user service}`         |
| Member access          | `{@link Class.method}`                | `{@link AuthService.refreshSession}`          |
| External URL           | `{@link https://...}`                 | `{@link https://tools.ietf.org/html/rfc7519}` |
| Symbol + section       | `{@link Symbol!heading:section}`      | TypeDoc-specific; avoid for portability       |

## Rendering expectations

When this skill writes JSDoc that follows all 14 rules and the formatting
guidance, the rendered TypeDoc output should:

- Show the summary on the index page.
- Show the summary plus `@remarks` plus all `@param`/`@returns`/`@throws`
  on the detail page.
- Render `{@link}` as clickable links that resolve to the target symbol.
- Render Markdown headings inside `@remarks` as `<h2>`/`<h3>` sections.
- Render `@example` fenced code blocks with syntax highlighting.
- Strip `@privateRemarks` from public output.
- Exclude `@internal` symbols entirely.

If the rendered output does not match this expectation, the JSDoc is
incorrect. Either a tag is wrong or the comment block has a parser-confusing
construct (most commonly: a literal `*/` inside the block).
```
