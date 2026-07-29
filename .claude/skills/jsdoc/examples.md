# Examples — JSDoc / TSDoc in this codebase

Real-world examples drawn from the repository. Each example shows the
**before** (typical JSDoc mistakes) and the **after** (this skill's target
output). Use these as templates; do not copy them verbatim into other files.

## Example 1 — A service-layer function

The function lives at the boundary between HTTP and persistence. It has
cache strategy, retry behavior, and side effects — exactly the five
attributes Rule 5 requires.

### Before

```ts
/**
 * Gets the user profile.
 */
export const getUserProfile = async (userId: string) => {
  // ... reads from cache, falls back to DB
};
```

### After

```ts
/**
 * Returns the {@link UserProfile} for the requested user.
 *
 * @remarks
 *
 * ## Cache Strategy
 *
 * Read-through Redis cache with a 5-minute TTL. Cache misses fall back to
 * PostgreSQL and repopulate the cache. The cache is invalidated by
 * {@link updateUserProfile}; callers do not need to invalidate manually.
 *
 * ## Failure Modes
 *
 * Throws {@link UserNotFoundError} when the user does not exist. Redis
 * unavailability is treated as a cache miss — the function never throws on
 * cache failure.
 *
 * ## Side Effects
 *
 * On a cache miss, reads from PostgreSQL and writes the result to Redis.
 * No mutation of the underlying user record.
 *
 * @param userId - ULID of the user; resolved from the active session.
 * @returns The user's profile including timestamps and preferences.
 * @throws {UserNotFoundError} When no user matches `userId`.
 */
export const getUserProfile = async (userId: string): Promise<UserProfile> => {
  // ...
};
```

## Example 2 — A middleware

Middleware has request-lifecycle side effects. Rule 4 requires documenting
those explicitly.

### Before

```ts
/**
 * Auth middleware.
 */
export const authMiddleware = (req, res, next) => {
  // ...
};
```

### After

```ts
/**
 * Verifies the JWT access token and attaches the authenticated user's
 * identity to downstream handlers.
 *
 * @remarks
 *
 * ## Request Lifecycle
 *
 * Pre-handler middleware. Runs before any route handler. Short-circuits the
 * pipeline on auth failure — never calls `next()` after sending a response.
 *
 * ## Side Effects
 *
 * - Reads the access token from the `Authorization` header or
 *   `access_token` cookie.
 * - Verifies the token signature against the JWKS endpoint (cached in
 *   memory for 1 hour).
 * - On success: attaches {@link AuthenticatedUser} to `req.user`.
 * - On failure: sends 401 with {@link UnauthorizedErrorResponse}.
 *
 * ## Failure Modes
 *
 * Returns 401 in all failure cases. The response body distinguishes:
 *
 * - `TOKEN_MISSING` — no Authorization header or cookie.
 * - `TOKEN_EXPIRED` — past the access token TTL.
 * - `TOKEN_INVALID` — signature mismatch or revoked session.
 *
 * @param req - Express request augmented with `req.user` after this middleware.
 * @param res - Express response.
 * @param next - Express continuation; called only on success.
 */
export const authMiddleware = (req, res, next): void => {
  // ...
};
```

## Example 3 — A repository

Repositories are where the persistence contract lives. Rule 6 demands
documenting transactions, locking, and isolation.

### Before

```ts
/**
 * Updates the seat inventory.
 */
export const updateSeatInventory = async (seats: Seat[]) => {
  // ...
};
```

### After

```ts
/**
 * Persists the updated seat inventory for a schedule.
 *
 * @remarks
 *
 * ## Transactions
 *
 * Runs inside the caller's transaction. The caller is responsible for
 * opening and committing — this function does NOT manage the transaction
 * boundary. Pass a transactional `PrismaClient` instance to honour the
 * caller's scope.
 *
 * ## Concurrency
 *
 * Uses optimistic locking via the `version` column. Updates fail with
 * {@link OptimisticLockError} when the stored version does not match the
 * caller's expected version. Callers should retry with the latest version.
 *
 * ## Idempotency
 *
 * The function is NOT idempotent. Replaying an update with the same input
 * advances the version counter twice, which causes subsequent reads to
 * observe a stale version. Use {@link SeatInventoryEvent} for replay-safe
 * seat updates.
 *
 * @param scheduleId - Identifier of the schedule whose seats are updated.
 * @param seats - The complete seat set; missing seats are removed.
 * @param expectedVersion - The version the caller observed before this update.
 * @throws {OptimisticLockError} When `expectedVersion` is stale.
 */
export const updateSeatInventory = async (
  scheduleId: string,
  seats: Seat[],
  expectedVersion: number,
): Promise<void> => {
  // ...
};
```

## Example 4 — A controller

Controllers document HTTP behavior, not business logic (Rule 7).

### Before

```ts
/**
 * Logs the user in.
 */
export const loginController = async (req, res) => {
  // ...
};
```

### After

```ts
/**
 * Authenticates a user via email + password.
 *
 * @remarks
 *
 * On success, sets the `access_token` and `refresh_token` HTTP-only cookies
 * and responds with the {@link User} profile. The cookies are scoped to the
 * gateway domain; downstream services read them via the gateway.
 *
 * Rate-limited to 5 attempts per minute per IP via {@link LoginRateLimiter}.
 * Failed attempts increment a counter that locks the account after 10
 * consecutive failures within 15 minutes.
 *
 * @param req - Express request with `email` and `password` in the JSON body.
 * @param res - Express response. Returns 200 on success with {@link User},
 *   401 on invalid credentials, 429 when rate-limited, 400 on validation
 *   failure.
 */
export const loginController = async (
  req: Request,
  res: Response,
): Promise<void> => {
  // ...
};
```

## Example 5 — A pure utility

Pure utilities get shorter docs, but the contract still needs answering.

### Before

```ts
/**
 * Slugify a string.
 */
export const slugify = (s: string) => s.toLowerCase().replace(/\s+/g, "-");
```

### After

```ts
/**
 * Converts an arbitrary string into a URL-safe slug.
 *
 * @remarks
 *
 * Lowercases the input and replaces each run of whitespace with a single
 * hyphen. Non-ASCII characters are preserved (the slug stays Unicode).
 * Punctuation and control characters are not stripped — callers must
 * pre-clean if those are expected.
 *
 * @param input - The string to slugify. May contain any Unicode characters.
 * @returns The slugified form, or the empty string when `input` is empty.
 */
export const slugify = (input: string): string =>
  input.toLowerCase().replace(/\s+/g, "-");
```

## Example 6 — A file header

Every hand-written source file gets a header block (see Rule 14). Example
for a build script.

```ts
/**
 * Mirrors generated OpenAPI specifications into the Postman Native Git
 * workspace.
 *
 * Source of truth: apps/<id>/openapi.yaml. This script does not communicate
 * with Postman Cloud; publishing happens via the Postman Desktop app or CLI.
 *
 * Why this script: the Postman workspace expects one spec per directory
 * under postman/specs/, so this script bridges each generated per-service
 * spec into its own Postman directory.
 *
 * Managed output: postman/specs/<displayName>/openapi.yaml
 */
```

## Patterns to avoid

These are all things this skill explicitly rejects:

```ts
/** @param id - string */                                // Rule 1 — restates the type
/** Gets profile. */                                    // Rule 2 — restates the name
/**
 * @param left @param right
 */                                                     // Multiple tags per line
/**
 * Returns the User.                                    // No {@link}
 */
export const getUser = () => { ... };
/** @throws {Error} If something goes wrong. */          // Vague error doc
```

The right pattern is the one above in each "After" example.
