# IRCTC Platform — Project Manual

Distributed railway reservation platform. Turborepo + pnpm workspaces.
Domain-Driven Design, Clean Architecture, microservices with both REST
(per service) and gRPC (service-to-service).

This file is the **operating manual** for the project. Detailed
conventions live in `.claude/rules/` and focused skills live in
`.claude/skills/`. Read those before making non-trivial changes.

## 1. Stack at a glance

- Node.js (TypeScript, `nodenext`, strict mode, `verbatimModuleSyntax`)
- Express 5 (HTTP per service)
- Prisma + PostgreSQL (per-service data)
- Redis / ioredis (caching, idempotency, distributed locks)
- Kafka / kafkajs (transactional outbox + consumers with idempotency)
- gRPC / nice-grpc (service-to-service RPC)
- OpenTelemetry, Pino, Zod

## 2. Apps

| Service                | Owns                                                                     |
| ---------------------- | ------------------------------------------------------------------------ |
| `admin-service`        | Stations, trains, coaches, seat templates, routes, schedules             |
| `user-service`         | Registration, auth, profile                                              |
| `booking-service`      | Seat allocation and reservation                                          |
| `payment-service`      | Payment processing and verification                                      |
| `search-service`       | Station / train search with Redis caching and Elasticsearch projection   |
| `notification-service` | Event-driven notifications                                               |
| `inventory-service`    | Schedule / seat projections, hold lifecycle, **gRPC server (Inventory)** |
| `api-gateway`          | REST entry point, routing, auth middleware, rate limiting                |

## 3. Packages (`@irctc/*`)

`errors`, `http`, `logger`, `middleware`, `kafka`, `grpc`, `contracts`
(versioned Zod events + buf-generated gRPC), `openapi` (shared envelope
and error responses), `telemetry`, `redis`, `resilience`.

## 4. Command permissions

### Allowed without asking

Repository inspection and package tooling that is local, read-only, or
non-destructive.

**Repository inspection**

```text
pwd, ls, tree, find, cat, less, head, tail, grep, rg, fd
```

**Git (read only)**

```text
git status, git diff, git diff --cached, git log, git show,
git branch, git remote -v, git rev-parse, git ls-files
```

**Package manager**

```text
pnpm install
pnpm build / lint / check-types / format
pnpm --filter <workspace> build / lint / check-types / format
```

**Prisma**

```text
pnpm --filter <service> prisma generate
```

**Turbo / spec / SDK regeneration**

```text
pnpm turbo run build
pnpm turbo run lint
pnpm turbo run check-types
pnpm turbo run build:spec
pnpm turbo run generate:api
pnpm codegen                       # generate:api (chains build:spec via turbo deps) → format
pnpm --filter @irctc/contracts build
```

**Read-only Docker**

```text
docker ps, docker images, docker compose config, docker compose ps
```

**Regenerated artefacts** (do not edit by hand; regenerate the producer)

```text
OpenAPI specs, orval SDK, buf-generated gRPC, Prisma Client
```

### Requires confirmation

**Long-running**

```text
pnpm dev, pnpm --filter <service> dev,
docker compose up / watch
```

**Database schema / data**

```text
prisma migrate dev / deploy,
prisma db push / seed
```

**Docker build / lifecycle**

```text
docker build, docker run,
docker compose up / down / restart
```

**Git writes**

```text
git add, git commit, git push,
git merge, git rebase, git tag
```

**External systems** (production only)

```text
Kafka production topics, production Redis, production PostgreSQL,
production REST APIs, production gRPC endpoints
```

**Dependency updates**

```text
pnpm add, pnpm remove, pnpm update
```

### Never run

```text
rm -rf, sudo rm
git reset --hard, git clean -fdx, git push --force, git rebase --onto
drop database, truncate table, delete from without where
```

Never:

- delete migrations
- rewrite git history on a shared branch
- modify `.env` except `.env.example`
- rotate secrets or touch the secret manager
- access production databases
- publish Kafka events to production topics
- execute destructive SQL
- disable tests to make them pass

When in doubt, ask.

## 5. Working style

After code changes, run automatically:

> if it is a single service or packages code change

```text
<!-- for service -->
pnpm --filter <service> check-types
pnpm --filter <service> lint
pnpm --filter <service> build

<!-- for package -->
pnpm --filter <@irctc/package> check-types
pnpm --filter <@irctc/package> lint
pnpm --filter <@irctc/package> build
```

> if it's a multi service / repo code change

```text
pnpm check-types
pnpm lint
pnpm build
```

> if it's a schema / contracts / API change

```text
<!-- for schema -->
pnpm --filter <service> prisma generate

<!-- for contracts -->
pnpm --filter @irctc/contracts build

<!-- for API -->
pnpm codegen
```

A change is "done" only when typecheck and lint are clean and build is successful with no errors.

## 6. Where conventions live

Layer invariants (loaded on every turn) — [`.claude/rules/`](./.claude/rules/):

- [`architecture.md`](./.claude/rules/architecture.md) — layered architecture, service template, container/DI, transactions, outbox, gRPC
- [`bootstrap.md`](./.claude/rules/bootstrap.md) — `server.ts` startup, graceful shutdown, health endpoints
- [`typescript.md`](./.claude/rules/typescript.md) — strict TS, no `any`, naming, DTO shape, path aliases
- [`error-handling.md`](./.claude/rules/error-handling.md) — `ApiError`, error registry, Prisma/Zod/kafkajs/grpc translation
- [`logging.md`](./.claude/rules/logging.md) — no PII, structured logs, error-code bridge
- [`imports-exports.md`](./.claude/rules/imports-exports.md) — barrel exports, named exports only, path aliases, `.js` extensions
- [`invariants.md`](./.claude/rules/invariants.md) — non-negotiable cross-service rules
- [`documentation.md`](./.claude/rules/documentation.md) — JSDoc, README format, `*/` rule
- [`git.md`](./.claude/rules/git.md) — commit messages, branch policy, auto-commit rule

Focused workflows (loaded on demand) — [`.claude/skills/`](./.claude/skills/):

- [`jsdoc`](./.claude/skills/jsdoc/SKILL.md) — README-format JSDoc on hand-written TS
- [`openapi`](./.claude/skills/openapi/SKILL.md) — design and review OpenAPI contracts, manage the merged gateway spec
- [`grpc-service`](./.claude/skills/grpc-service/SKILL.md) — add a gRPC method, proto edit, server registration, client singleton
- [`kafka-consumer`](./.claude/skills/kafka-consumer/SKILL.md) — scaffold a Kafka consumer with DLQ and idempotency
- [`prisma-repository`](./.claude/skills/prisma-repository/SKILL.md) — write a Prisma repository with transaction propagation
- [`redis-cache`](./.claude/skills/redis-cache/SKILL.md) — add Redis caching, locks, or idempotency keys

User-invoked workflows — [`.claude/commands/`](./.claude/commands/):

- `/code-review` — review the current diff against the rules
- `/create-service` — scaffold a new microservice

## Commit messages

Follow `@commitlint/config-conventional` (see `package.json` and `.claude/rules/git.md`):

- **Header format**: `<type>(<scope>): <subject>` (e.g. `chore(config): standardize tsconfig and eslint`).
- **Header length**: Strictly **≤ 100 characters** (commitlint enforcement).
- **Subject**: Imperative mood ("add", not "added"), lowercase after colon, **no trailing period**.
- **Body**: Explain **WHY** the change was made, followed by key changes bulleted.
- **Auto-commit**: The user generates commit messages for substantial work; do not auto-commit unless explicitly asked.
