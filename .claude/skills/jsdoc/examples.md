# Examples — JSDoc / TSDoc in this Codebase

Concise reference examples demonstrating target JSDoc formatting across architecture layers.

## 1. Controller Layer

Controllers document HTTP contracts (`HTTP METHOD /path`), access permissions, and cookie actions. Omit `@returns` for `Promise<void>` and omit `@throws` (errors propagate via `asyncHandler`).

```ts
/**
 * AuthController
 *
 * Thin HTTP adapter for authentication and session management endpoints.
 *
 * ### Responsibilities
 * - Accepts schema-validated HTTP requests.
 * - Delegates domain logic to {@link AuthService}.
 * - Manages HTTP-only authentication cookies.
 *
 * ### Error Handling
 * - Does not catch errors inline; unhandled exceptions propagate to global error middleware.
 */
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Authenticates user with email and password.
   *
   * `POST /api/v1/auth/login`
   *
   * ### Access
   * Public
   *
   * ### Cookies
   * Sets HTTP-only `access_token` and `refresh_token`.
   *
   * @param req - Express request with validated {@link LoginRequestDto} body.
   * @param res - Express response object.
   */
  async login(req: Request, res: Response): Promise<void> {
    // 1. Delegate login execution to AuthService
    const result = await this.authService.login(req.body);
    // 2. Set authentication cookies and return user payload
    res.cookie("access_token", result.tokens.accessToken);
    res.json(result.user);
  }
}
```

## 2. Service Layer

Services document business contracts under `@remarks`: `### Responsibilities`, `### Side Effects`, `### Consistency Guarantees`, `### Failure Guarantees`, `@param`, `@returns`, and `@throws {ApiError}`.

```ts
/**
 * ## AuthService
 *
 * Core domain service managing user authentication, tokens, and session state.
 *
 * @remarks
 * ### Responsibilities
 * - Handles user login, token rotation, and session lifecycle.
 * - Publishes async notification events to Kafka.
 */
export class AuthService {
  /**
   * Authenticates user credentials and establishes a new session.
   *
   * @remarks
   * ### Responsibilities
   * - Validates email and bcrypt password hash against stored record.
   * - Issues JWT access/refresh token pair and stores session in Redis.
   * - Dispatches `UserLoggedInV1` notification event.
   *
   * ### Side Effects
   * - **PostgreSQL**: Reads user account record.
   * - **Redis**: Persists active session record with SHA-256 token hash.
   * - **Kafka**: Publishes `UserLoggedInV1` event.
   *
   * ### Consistency Guarantees
   * - Session creation rolls back PostgreSQL mutations if Redis store fails.
   *
   * ### Failure Guarantees
   * - Kafka publishing is non-blocking; login succeeds even if event fails.
   *
   * @param payload - Validated credentials DTO containing email and password.
   * @returns Auth payload containing JWT tokens and user profile DTO.
   *
   * @throws {ApiError}
   * `INVALID_CREDENTIALS` — Password does not match stored hash.
   *
   * @throws {ApiError}
   * `USER_NOT_FOUND` — Email is not registered.
   */
  async login(payload: LoginRequestDto): Promise<AuthResponseDto> {
    // 1. Fetch user by email from PostgreSQL repository
    const user = await this.repo.findByEmail(payload.email);

    // 2. Verify password against bcrypt hash
    const isValid = await bcrypt.compare(payload.password, user.passwordHash);

    // 3. Issue JWT tokens and persist session in Redis
    const tokens = await this.createSession(user.id);

    // 4. Publish UserLoggedInV1 event to Kafka (non-blocking)
    await this.loginPublisher.publish({ userId: user.id });

    return { user, tokens };
  }
}
```

## 3. Repository Layer

Repositories document persistence contracts, database/index queries, optimistic locking, and idempotency under `@remarks`.

```ts
/**
 * ## StationSearchRepository
 *
 * Data access repository managing station search index operations in Elasticsearch.
 *
 * @remarks
 * ### Responsibilities
 * - Manages index creation with custom edge-ngram autocomplete analyzers.
 * - Executes completion queries against the `stations` index.
 *
 * ### Storage & Persistence
 * - **Elasticsearch**: Target index defined by `env.STATION_INDEX_NAME`.
 */
export class StationSearchRepository {
  /**
   * Executes a boosted autocomplete query against active stations.
   *
   * @remarks
   * ### Responsibilities
   * - Builds boolean match query filtering `isActive: true` with code/name boosting.
   * - Maps hits to {@link StationSuggestion} DTOs.
   *
   * ### Side Effects
   * - **Elasticsearch**: Reads `stations` index.
   *
   * @param query - Search query string.
   * @param limit - Max results to return.
   * @returns Array of station suggestions sorted by relevance score.
   */
  async suggest(query: string, limit: number): Promise<StationSuggestion[]> {
    // 1. Execute multi-match search query on Elasticsearch stations index
    const hits = await this.esClient.search({ index: "stations", size: limit });

    // 2. Map Elasticsearch hits to StationSuggestion DTO array
    return hits.map((hit) => toSuggestion(hit._source));
  }
}
```

## 4. Middleware Layer

Middleware documents request lifecycle stage, side effects, and response guarantees.

```ts
/**
 * Verifies JWT access token and attaches user claims to request object.
 *
 * @remarks
 * ### Request Lifecycle
 * Pre-handler middleware. Short-circuits with 401 on auth failure.
 *
 * ### Side Effects
 * - Reads token from `Authorization` header or `access_token` cookie.
 * - Attaches {@link AuthenticatedUser} payload to `req.user`.
 *
 * @param req - Express request augmented with `req.user`.
 * @param res - Express response object.
 * @param next - Express continuation function.
 */
export const authMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  // 1. Extract access token from cookies or Authorization header
  // 2. Verify JWT signature and attach claims to req.user
  next();
};
```

## 5. Route Modules (`*.routes.ts`)

Route files use a **single top-level JSDoc block** covering routing responsibilities and middleware pipeline. Per-route comments above `router.get`/`router.post` calls are omitted.

```ts
/**
 * Admin coach routes.
 *
 * Registers HTTP endpoints for admin coach operations and applies middleware pipeline.
 *
 * ### Responsibilities
 * - Route incoming requests (`/api/v1/coaches`).
 * - Apply parameter and body schema validation via Zod.
 * - Delegate execution to {@link CoachController}.
 *
 * ### Middleware Pipeline
 * - {@link requireAdmin} — Enforces admin authorization.
 * - {@link validateSchema} — Validates request body payloads.
 * - {@link asyncHandler} — Routes async exceptions to global error handler.
 */
const router: Router = Router();

router.get(
  "/:coachId",
  validateParams(coachIdSchema),
  asyncHandler(coachController.getCoach),
);
```

## 6. Pure Utility

```ts
/**
 * Converts an arbitrary string into a URL-safe slug.
 *
 * @remarks
 * Lowercases input and replaces runs of whitespace with a single hyphen.
 * Non-ASCII characters are preserved.
 *
 * @param input - Raw string to slugify.
 * @returns Lowercased slug string.
 */
export const slugify = (input: string): string =>
  input.toLowerCase().replace(/\s+/g, "-");
```

## Anti-Patterns to Avoid

- ❌ `@param id - string` (Restates the type instead of domain meaning)
- ❌ `@returns Promise<void>` on controllers (Noise; Express handlers return no value)
- ❌ `@throws` on controllers (Errors propagate via `asyncHandler`)
- ❌ Per-route `@route` / `@desc` tags on `*.routes.ts` (Inline routes are self-documenting)
- ❌ Omitting 1:1 inline step comments (`// 1. ...`, `// 2. ...`) inside service/repo implementation bodies
