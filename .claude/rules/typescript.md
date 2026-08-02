# TypeScript

Strict mode is on across the workspace. The goal is types that make illegal states unrepresentable, not types that are merely present.

## Compiler settings (non-negotiable)

Centralized in `@repo/typescript-config` and extended by every package and app:

| Config             | Used By                        | Key Policies                                                                                                                         |
| ------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| **`base.json`**    | All projects                   | Baseline strictness (`strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `isolatedModules`, `skipLibCheck`)                |
| **`node.json`**    | Express microservices          | Service strictness (`exactOptionalPropertyTypes`, `noImplicitReturns`, `noImplicitOverride`, `noUnusedLocals`, `noUnusedParameters`) |
| **`nextjs.json`**  | Next.js frontend (`apps/web`)  | Next.js bundler settings (`jsx: preserve`, `moduleResolution: Bundler`)                                                              |
| **`library.json`** | Shared packages (`packages/*`) | Standard shared library settings                                                                                                     |

Individual `tsconfig.json` files must only declare local layout options (`rootDir`, `outDir`, `paths`, `include`, `exclude`). Never duplicate compiler policy in project configs.

## Forbidden

- `any` — there is no situation that calls for it. Use `unknown`, generics, or a discriminated union.
- Type assertions (`as Foo`) outside `*.mapper.ts` and the Prisma `tx` client. If you find yourself casting, the type is wrong.
- `// @ts-ignore` / `// @ts-expect-error` without a comment explaining the concrete reason.
- Non-null assertions (`x!`) in services, repositories, or controllers. The route layer is the only place where `req.params.trainId!` is acceptable, and even there prefer narrowing.
- `enum` from TypeScript. Use string union types or Prisma enums (`@generated/prisma/enums.js`).
- Default exports. Everything is a named export, even `app` (the express instance is exported as `default` in `app.ts` only because Express's `app.listen` pattern requires it; everywhere else, named).

## Required

- Explicit return types on every public method (services, repositories, controllers, workers). The `noImplicitReturns` rule is on; "I know what it returns" is not a substitute.
- `readonly` on class fields that are never reassigned (DI, config, repositories). This is the default in our codebase.
- Discriminated unions for state machines (`{ kind: "PENDING" } | { kind: "PROCESSING", leaseExpiresAt: Date } | ...`).
- Generics over `any` for reusable helpers (filters, mappers, repository finders).
- `unknown` and narrow with `instanceof` or Zod `safeParse` — never `error as Error`.
- Path aliases (`@dto`, `@services`, `@repository`, `@mappers`, `@config`, ...). Configure per app in `tsconfig.json` `paths`. See `imports-exports.md` for the canonical list.

## Naming

| Thing                | Convention                                        | Example                                                          |
| -------------------- | ------------------------------------------------- | ---------------------------------------------------------------- |
| Files                | kebab-case                                        | `seat-allocation.service.ts`                                     |
| Classes              | PascalCase, suffixed by layer                     | `SeatAllocationService`, `SeatAllocationRepository`              |
| Methods              | camelCase, verb-led                               | `holdSeats`, `getTrainById`, `markProcessed`                     |
| DTO schemas          | camelCase + `Schema`                              | `createTrainSchema`, `trainIdParamSchema`                        |
| DTO types            | PascalCase + `Dto`                                | `CreateTrainRequestDto`, `TrainIdParamDto`                       |
| Zod-inferred types   | `z.infer<typeof schema>` exported as a type alias | `type CreateTrainRequestDto = z.infer<typeof createTrainSchema>` |
| Error codes          | `SCREAMING_SNAKE_CASE` matching the key           | `TRAIN_ALREADY_EXISTS: "TRAIN_ALREADY_EXISTS"`                   |
| Topics / event types | `SCREAMING_SNAKE_CASE`                            | `BOOKING_HOLD_SEATS_REQUESTED`                                   |
| gRPC services        | PascalCase                                        | `InventoryServiceDefinition`, `InventoryServiceClient`           |
| gRPC methods         | camelCase                                         | `holdSeats`, `releaseSeats`                                      |

## DTO conventions

- Trim strings: `.string().trim()`.
- Coerce query numerics with `.preprocess((v) => v ? parseInt(v as string, 10) : default, ...)`.
- For `optional` booleans coming over the wire, preprocess `"true" | "false"` to boolean.
- Use `.uuid("Invalid <resource> ID format. Must be a valid UUID.")` for ID params.
- For update DTOs, add a `.refine` to require at least one field: `Object.values(payload).some((v) => v !== undefined)`.
- Derive the type with `z.infer<typeof schema>` and **export it as a type alias**, never a class.
- A single DTO file often contains a request, query, and param schema. Group by aggregate (e.g. `train.dto.ts` has `createTrainSchema`, `updateTrainSchema`, `listTrainsQuerySchema`, `trainIdParamSchema`).

## What to do when the type is ugly

1. Add a discriminator.
2. Make the type a union, not a single shape with optional fields.
3. Split the function — different state, different method.
4. Introduce a small DTO at the boundary.

`unknown` + Zod is the right answer for external data. A tagged union is the right answer for internal state. Resist the urge to cast.

## `void` vs `Promise<void>`

Async functions always return `Promise<...>`. Use `void` only for the return type of fire-and-forget callbacks (e.g. `process.on("SIGINT", () => { void shutdown(...); })`). The `void` keyword on the inner call is what tells the linter "I am intentionally not awaiting this" — leaving it off is an error.

## JSDoc

Production-grade JSDoc on every public method and every class. See `jsdoc` skill for the full standard. The TL;DR:

- Class JSDoc explains responsibility + external systems (≤10 lines).
- Method JSDoc lists workflow steps, side effects, transactional behaviour, security notes, and `@throws` entries.
- Private methods get one short sentence.
- No tutorial walkthroughs, no line-by-line comments, no comments that repeat the code.
