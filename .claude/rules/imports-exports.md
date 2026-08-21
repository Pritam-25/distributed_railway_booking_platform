# Imports & Exports

Two rules keep the imports graph stable: **barrel exports everywhere** and **named exports only**. Both are enforced by structure, not by lint, so follow them by hand.

## Barrel exports

Every folder that holds more than one module has an `index.ts` that re-exports the public surface.

```
services/
  ├── coach.service.ts
  ├── train.service.ts
  ├── index.ts          ← barrel

export * from "./train.service.js";
export * from "./coach.service.js";
```

Other layers import through the barrel, never the leaf file.

Good:

```ts
import { TrainService, CoachService } from "@services";
import { TrainRepository, OutboxRepository } from "@repository";
import { createTrainSchema, trainIdParamSchema } from "@dto";
```

Bad:

```ts
import { TrainService } from "../services/train.service.js";
import { createTrainSchema } from "../dto/train.dto.js";
```

### Folders with barrels

Every service must have an `index.ts` in each of these:

- `src/services/`
- `src/repository/`
- `src/controllers/`
- `src/dto/`
- `src/mappers/`
- `src/middleware/`
- `src/api/v1/routes/`
- `src/consumers/`
- `src/workers/`
- `src/utils/errors/`
- `src/config/`
- `src/container/`
- `src/grpc/` (when the service has gRPC code)

Add a new folder? Add the barrel in the same change.

## Named exports only

```ts
// Good
export class TrainService {}
export const createTrainSchema = z.object({...});
export type CreateTrainRequestDto = z.infer<typeof createTrainSchema>;

// Bad
export default class TrainService {}
export default createTrainSchema;
```

The only file in a service that uses `export default` is `app.ts` (the Express application instance). Even there, prefer a named `export const app` when the runtime allows.

## Path aliases

Configure per-app in `tsconfig.json` `paths`. The canonical set:

```jsonc
"paths": {
  "@config/*":            ["./src/config/*"],
  "@config":              ["./src/config/index.js"],
  "@container":           ["./src/container/index.js"],
  "@routes":              ["./src/api/v1/routes/index.js"],
  "@services":            ["./src/services/index.js"],
  "@repository":          ["./src/repository/index.js"],
  "@controllers":         ["./src/controllers/index.js"],
  "@middleware":          ["./src/middleware/index.js"],
  "@utils/errors":        ["./src/utils/errors/index.js"],
  "@utils/common":        ["./src/utils/common/index.js"],
  "@utils":               ["./src/utils/index.js"],
  "@dto":                 ["./src/dto/index.js"],
  "@mappers":             ["./src/mappers/index.js"],
  "@events/publishers":   ["./src/events/publishers/index.js"],
  "@generated/*":         ["./src/generated/*"],
  "@workers":             ["./src/workers/index.js"],
  "@grpc":                ["./src/grpc/index.js"]
}
```

Use these aliases inside the service. Cross-service imports always go through `@irctc/...` package names (`@irctc/contracts`, `@irctc/logger`, `@irctc/errors`, `@irctc/grpc`, ...).

## Module specifier style

`verbatimModuleSyntax` is on. Imports must use the explicit `.js` extension for relative paths:

```ts
import { env } from "@config/env.js";
import { TrainService } from "@services/index.js";
import { prisma } from "@config/prisma.js";
```

`@irctc/...` package imports drop the extension (TypeScript resolves them via `package.json` `exports`).

Type-only imports use `import type`:

```ts
import type { Request, Response } from "express";
import type { Train } from "@generated/prisma/client.js";
import type { CreateTrainRequestDto } from "@dto";
```

Mixing type and value imports in a single statement trips `verbatimModuleSyntax` — split them.

## When the barrel is the wrong call

- `@generated/*` is intentionally **not** barrel-exported through `@dto` or anywhere else. Prisma's generated client is huge; consumers import from `@generated/prisma/client.js` or `@generated/prisma/enums.js` directly to keep the type graph narrow.
- `nice-grpc` generated types (the `*ServiceDefinition` / `*ServiceClient` pairs) are imported directly from `@irctc/contracts` (where the buf-generated TS lives) — never from `@irctc/grpc`.
- `@config` and `@repository` are imported as `from "@config/env.js"` / `from "@repository/train.repo.js"` when you need a specific submodule; the barrel is for the cross-cutting set.

## Re-exports through `routes/index.ts`

The top-level router file `src/api/v1/routes/index.ts` re-exports every named router and exposes a default `router` for `app.ts` to mount under `/api/v1`:

```ts
const router: Router = Router();
router.use("/admin/trains", trainRoutes);
export { router, trainRoutes, stationRoutes, ... };
export default router;
```

This lets containers import controllers next to routes, and lets tests mount individual routers.

## Adding a new module

1. Create the file in the right folder.
2. Add a named export.
3. Re-export it from the folder's `index.ts`.
4. Import it via the alias in consumers.
5. Run `pnpm --filter <service> check-types` to make sure the path is wired through.

If a step is "I'll just import from the leaf file this once" — add the barrel entry instead. The cost is one line, the payoff is grep-able.
