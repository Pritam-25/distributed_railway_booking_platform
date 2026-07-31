# Documentation

Where documentation lives, and where it does not.

## What gets documented

- **Hand-written source files** get rich file-level and per-export JSDoc. See the `jsdoc` skill for the full standard.
- **Module headers** declare `@packageDocumentation` so TypeDoc emits a top-level page for the file.
- **Generated infrastructure** (OpenAPI specs, orval output, buf-generated gRPC types) is documented at the architectural level on the **producer** that emits it — never inside the generated file.

## The README-format JSDoc rule

When writing JSDoc on hand-written TS, follow the README format (`.claude/skills/jsdoc/SKILL.md` Rule 14):

```text
## Symbol Name
One-line summary.

### Responsibilities
- what it owns

### Side Effects
- I/O, network, logging, state mutations

### Errors
- what it throws / returns on failure

### Remarks
- non-obvious behaviour, links to related code
```

Skip empty sections. Use `@param`, `@returns`, `@throws` for parameters and returns.

## The `*/` rule

**Never write a literal `*/` inside a JSDoc block** — it closes the comment early.

If you need to express one in prose:

- rephrase ("`app/s`" instead of "*/")
- escape the slash: `app&#x2F;s`
- use a placeholder: `<id>`

## Module header

Every hand-written TS file starts with:

```ts
/**
 * ## module/symbol
 *
 * One-line description.
 *
 * @packageDocumentation
 */
```

`@packageDocumentation` tells TypeDoc this file is a module entry point. Without it, the file's exports don't show up in the generated docs.
