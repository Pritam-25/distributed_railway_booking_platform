# Style Guide — JSDoc / TSDoc Formatting

Complements `SKILL.md`. This file covers **how comments are formatted**, not
**what they should say**. The 14 rules in `SKILL.md` cover the substance.

## Block delimiters

- Always use `/** ... */` for documentation comments. The leading `**`
  distinguishes documentation comments from regular block comments and is
  the marker TypeDoc and TSDoc parsers look for.
- One JSDoc block per symbol. Do not split a function's docs across multiple
  detached blocks — tools only attach the immediately preceding block.

## Indentation

- Align the body of the JSDoc with the surrounding code (Google TS style).
  Each line of the comment starts with the same indent as the code it
  describes.
- The `*` continuation character is not required for plain prose lines, but
  using it consistently makes diffs cleaner when lines wrap.

```ts
/**
 * Summary on first line.
 *
 * Extended prose on subsequent lines, indented to match the code that
 * follows this block.
 */
export const foo = 1;
```

## One tag per line

`@param left @param right` is wrong. Each block tag occupies its own line:

```ts
/**
 * @param left  - The left operand.
 * @param right - The right operand.
 */
```

## Parameter description separator

`@param name - description` (hyphen separator). TSDoc and TypeDoc both
require the separator.

## Line wrapping

TypeDoc and TSDoc parsers ignore plain-text wrapping. Do not rely on column
alignment to imply structure. Use Markdown for structure:

```ts
/**
 * @remarks
 *
 * ## When to call this
 *
 * Call this on every login. Do not call more than once per minute.
 */
```

## Markdown inside JSDoc

TSDoc and TypeDoc accept CommonMark inside JSDoc. Use:

- `#`/`##`/`###` headings inside `@remarks` for sections.
- Bullet lists for enumerations.
- Fenced code blocks for short examples.
- Inline backticks for type names: `` `User` ``, `` `ErrorResponse` ``.

Avoid mixing prose bullets with `*` JSDoc continuation markers in ways that
make diffs noisy:

```ts
/**
 * @remarks
 *
 * Steps:
 *
 * 1. Parse the token.
 * 2. Verify the signature.
 * 3. Resolve the user.
 */
```

## The `*/` footgun

**Never write a literal `*/` inside a JSDoc block.** Block comments end at
the first `*/`. The following patterns all break:

```ts
/**
 * Globs paths under apps/*/openapi.yaml.    ← BAD — closes the comment
 *
 * The example above closes the block at "apps/*/".
 */
```

Workarounds, in order of preference:

1. **Rephrase as prose.** "Scans the openapi.yaml of every workspace app."
2. **Use `<id>` or another placeholder.** "Scans `apps/<id>/openapi.yaml`."
3. **Escape the slash.** "Scans `app&#x2F;s/*/openapi.yaml`." (ugly; avoid.)

## Format consistency

- One blank line between the prose summary and the first block tag.
- One blank line between `@remarks` and the next block tag.
- No trailing blank lines inside the block.
- The opening `/**` and closing `*/` markers do not get trailing spaces.

## What NOT to put in JSDoc

- Internal implementation notes that the public consumer doesn't need
  (`// Implementation note:` style comments belong as `//` next to the line).
- Editorializing. "We should refactor this" is not JSDoc.
- TypeScript type annotations. The signature already has them.
- License boilerplate (lives at the top of the file as a separate block).
- TODO comments (those go in `// TODO(name):` form).

## Cross-reference syntax

```ts
/**
 * @returns The {@link User} profile.
 * @throws {@link SessionExpiredError} If the session has expired.
 * @see {@link AuthService.refreshSession} for the call site.
 */
```

Pipe-separated labels override the displayed text:

```ts
/** @see {@link UserService | the user service} */
```

## Visibility

For internal symbols that should NOT appear in TypeDoc output:

```ts
/** @internal */
export const _internal = () => { ... }
```

For deprecated symbols:

```ts
/** @deprecated Use {@link newFunction} instead. Will be removed in v2. */
```

## Self-review checklist before saving

- [ ] No `*/` literal inside the block.
- [ ] Block opens with `/**`, closes with `*/`.
- [ ] Tags are one-per-line, hyphen-separated, no `@param left @param right`.
- [ ] Indentation matches the code that follows.
- [ ] Cross-references use `{@link}`.
- [ ] Markdown sections are fenced under `@remarks`, not floating.
- [ ] No TypeScript syntax leaking into prose ("`User`", not `<User>`).
- [ ] No editorial content, TODOs, or implementation noise.
- [ ] No `@packageDocumentation` or file-level JSDoc header (the skill does not require them).
