/**
 * Mirrors generated OpenAPI specifications into the Postman Native Git workspace.
 *
 * In a microservice monorepo, every service generates its own OpenAPI spec from
 * a Zod registry. The combined system is exposed via the API gateway, whose
 * `build:spec` task already aggregates upstream service specs. The Postman
 * workspace, however, expects one spec per directory under `postman/specs/`.
 * This script bridges that gap by mirroring each generated spec into its own
 * Postman directory.
 *
 * ```
 *   Application source                 Postman workspace
 *   ─────────────────                  ─────────────────
 *   apps/<id>/openapi.yaml      →      postman/specs/<displayName>/openapi.yaml
 *                                       │
 *                                       │ postman workspace push
 *                                       ▼
 *                                    Postman Cloud
 * ```
 *
 * `apps/<id>/openapi.yaml` is the source of truth. `postman/specs/` is the
 * local mirror managed by this script. Postman's Native Git treats the
 * `postman/` directory as its local workspace representation; this script
 * keeps that representation in sync with the generated application specs.
 *
 * **Behaviour**
 *
 * - **In-place content replacement.** Each run writes the latest spec bytes
 *   into the existing destination file (`openapi.yaml`) at the same relative
 *   path. Files are NEVER deleted-and-recreated; the path is stable across
 *   runs so Postman's Native Git watcher sees content modifications rather
 *   than delete+add events. A delete+add cycle causes Postman to re-detect
 *   the "new" file and append an absolute-path entry alongside the relative
 *   one in `.postman/resources.yaml`, which is what we want to avoid.
 *
 * - **Stale-directory pruning.** Directories under `postman/specs/` whose
 *   name no longer matches a current `publish: true` service are removed
 *   after the live mirrors have been written. This still cleans up renamed
 *   or removed services, but does so AFTER the live files are stable so the
 *   watcher never sees a moment of empty `postman/specs/`.
 *
 * - **Glob-style discovery.** Scans each app's generated openapi.yaml for
 *   every workspace app. Adding a new service app automatically participates
 *   in the report (visible in CI logs) without editing a list.
 *
 * - **Metadata enrichment.** Each discovered service is enriched from
 *   `scripts/services.config.ts`. Services absent from that map are treated
 *   as `publish: false` — their specs are NOT mirrored, but they DO appear
 *   in the summary so the omission is visible.
 *
 * - **Idempotent, unconditional mirroring.** If the destination file does not
 *   match the source (e.g. a stale copy from a previous deployment), it is
 *   overwritten. Manual edits to `postman/specs/...` are discarded; that
 *   directory is a managed mirror, not an editable workspace.
 *
 * - **Line endings preserved.** The user-service spec generator emits CRLF;
 *   the gateway spec is regenerated on every `build:spec`. We do not re-encode
 *   — the mirror is byte-faithful.
 *
 * **Out of scope**
 *
 * - `.postman/resources.yaml` — managed by Postman; do not edit here.
 * - `.postman/workflows.yaml` — managed by Postman; do not edit here.
 * - Multi-spec OpenAPI merge — handled by `api-gateway`'s own `build:spec`
 *   task; this script only mirrors already-merged outputs.
 *
 * **Invocation**
 *
 * ```
 *   Direct:    pnpm exec tsx scripts/sync-postman.ts
 *   Pipeline:  pnpm docs          # runs turbo run sync:postman
 * ```
 *
 * The Turbo task `sync:postman` declares `dependsOn: [api-gateway#build:spec]`,
 * and the gateway `build:spec` task transitively depends on each upstream
 * service's `build:spec`. When new services are added to the public API
 * surface, the gateway's `dependsOn` list must be extended in `turbo.json` so
 * this script's run remains ordered correctly. The gateway task is the single
 * source of truth for the build graph — this script does not independently
 * attempt to schedule upstream service builds.
 *
 * @module scripts/sync-postman
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SERVICES } from "./services.config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Repository root resolved relative to this script. We do our own path
 * relolution rather than relying on `process.cwd()` so the script can be
 * invoked from any working directory.
 */
const REPO_ROOT = path.resolve(__dirname, "..");

/**
 * Directory containing every workspace app (e.g. `user-service`,
 * `admin-service`, `api-gateway`).
 */
const APPS_DIR = path.join(REPO_ROOT, "apps");

/**
 * Postman Native Git mirror directory. Each published service's
 * `openapi.yaml` is written here under `<displayName>/openapi.yaml`.
 *
 * The parent `postman/` directory (which also holds `collections/`,
 * `environments/`, `mocks/`, etc.) is never touched by this script.
 */
const POSTMAN_SPECS_DIR = path.join(REPO_ROOT, "postman", "specs");

/**
 * Derives a stable, human-readable display name from a workspace service id
 * when no `displayName` is registered in `services.config.ts`.
 *
 * `user-service` becomes `User Service`, `api-gateway` becomes `Api Gateway`.
 * The result is only used for summary log lines and CI output for services
 * that have no metadata entry; published services always use the explicit
 * `displayName` from `services.config.ts`.
 *
 * @param serviceId - Workspace service id (e.g. `user-service`).
 * @returns Title-Case form of the service id with hyphens replaced by spaces.
 */
const deriveDefaultDisplayName = (serviceId: string): string => {
  return serviceId
    .split("-")
    .map((segment) =>
      segment.length === 0
        ? segment
        : segment[0]!.toUpperCase() + segment.slice(1),
    )
    .join(" ");
};

/**
 * Metadata describing a service discovered in the workspace, after
 * enrichment with `services.config.ts`.
 */
type DiscoveredService = {
  /** Workspace id (e.g. `user-service`). */
  id: string;
  /** Resolved display name (e.g. `User Service API`). */
  displayName: string;
  /**
   * Whether this service's spec should be mirrored. Only `true` when
   * `publish: true` in `services.config.ts` AND a generated
   * `openapi.yaml` exists at `apps/<id>/openapi.yaml`.
   */
  publish: boolean;
  /**
   * Absolute path to `apps/<id>/openapi.yaml`, or `null` when no
   * generated spec exists at that location.
   */
  sourceSpecPath: string | null;
  /**
   * Reason the service was skipped (only set when `publish` is `false`).
   * Used for the summary log line; absent for published services.
   */
  skipReason: string | null;
};

/**
 * Walks `apps/*` and returns one record per app directory, regardless of
 * whether a generated spec exists yet.
 *
 * Services are matched against the `SERVICES` metadata map; missing entries
 * get safe defaults (`publish: false`, derived `displayName`). The returned
 * list is sorted with published services first (alphabetical by display
 * name) followed by unpublished ones — CI logs scan easier when the order
 * is deterministic.
 *
 * @returns Ordered collection of discovered services with metadata
 *   resolved.
 */
const discoverServices = (): DiscoveredService[] => {
  if (!fs.existsSync(APPS_DIR)) {
    return [];
  }

  const entries = fs.readdirSync(APPS_DIR, { withFileTypes: true });

  const discovered: DiscoveredService[] = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const serviceId = entry.name;
      const sourceSpecPath = path.join(APPS_DIR, serviceId, "openapi.yaml");
      const hasSpec = fs.existsSync(sourceSpecPath);

      const metadata = SERVICES[serviceId];
      const displayName =
        metadata?.displayName ?? deriveDefaultDisplayName(serviceId);
      const publish = metadata?.publish === true;

      let skipReason: string | null = null;
      if (!hasSpec) {
        skipReason = "no openapi.yaml";
      } else if (!publish) {
        skipReason = "publish=false";
      }

      return {
        id: serviceId,
        displayName,
        publish: hasSpec && publish,
        sourceSpecPath: hasSpec ? sourceSpecPath : null,
        skipReason,
      };
    });

  // Stable sort: published services first (alphabetical), then unpublished
  // (alphabetical). CI logs scan easier when the order is deterministic.
  discovered.sort((a, b) => {
    if (a.publish !== b.publish) return a.publish ? -1 : 1;
    return a.displayName.localeCompare(b.displayName);
  });

  return discovered;
};

/**
 * Mirrors a single source spec to its destination path, preserving source
 * byte-for-byte (including line endings).
 *
 * Uses a `Buffer` round-trip rather than `readFileSync` (UTF-8 string) +
 * `writeFileSync` (UTF-8 string) because the latter can re-encode line
 * endings inconsistently across Node versions on Windows. The user-service
 * spec generator currently emits CRLF; the gateway spec is regenerated on
 * every `build:spec`. We do not re-encode — the mirror is byte-faithful.
 *
 * Side effect: creates the destination directory tree on demand, so the
 * caller does not need to mkdir first.
 *
 * @param sourcePath - Absolute path to the generated source spec
 *   (`apps/<id>/openapi.yaml`).
 * @param destinationPath - Absolute path to write the mirror to
 *   (`postman/specs/<displayName>/openapi.yaml`).
 */
const mirrorSpec = (sourcePath: string, destinationPath: string): void => {
  const bytes = fs.readFileSync(sourcePath);
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.writeFileSync(destinationPath, bytes);
};

/**
 * Removes directories under `POSTMAN_SPECS_DIR` whose names don't match any
 * currently-published service.
 *
 * This is the cleanup pass that replaces the previous "wipe everything
 * first" behaviour: `main()` writes the live mirrors first so Postman's git
 * watcher never sees an empty directory, then this function prunes only the
 * directories that are truly stale (renamed or removed services).
 *
 * The parent `postman/` directory (which holds `collections/`,
 * `environments/`, `mocks/`, etc.) is never touched.
 *
 * @param liveDisplayNames - Display names that correspond to currently
 *   published services. Directories matching any of these names are kept.
 */
const pruneStaleSpecDirs = (liveDisplayNames: Set<string>): void => {
  if (!fs.existsSync(POSTMAN_SPECS_DIR)) return;

  for (const entry of fs.readdirSync(POSTMAN_SPECS_DIR)) {
    if (liveDisplayNames.has(entry)) continue;
    fs.rmSync(path.join(POSTMAN_SPECS_DIR, entry), {
      recursive: true,
      force: true,
    });
  }
};

/**
 * Renders the human-readable summary block emitted at the end of each run.
 *
 * Output shape:
 *
 * ```
 *   ──────────────────────────────────
 *   OpenAPI → Postman Sync
 *
 *   ✓ User Service API
 *   ✓ API Gateway
 *   ○ Booking Service API   (no openapi.yaml)
 *   ○ Payment Service API   (publish=false)
 *
 *   Updated: 2
 *   Skipped : 3
 *   ──────────────────────────────────
 * ```
 *
 * @param services - Every service discovered in the workspace.
 * @param updatedNames - Display names of services that were actually
 *   mirrored during this run.
 * @returns A multi-line string ready to be written to stdout.
 */
const renderSummary = (
  services: DiscoveredService[],
  updatedNames: string[],
): string => {
  const updatedSet = new Set(updatedNames);

  const serviceLines = services.map((service) => {
    if (service.publish && updatedSet.has(service.displayName)) {
      return `✓ ${service.displayName}`;
    }
    if (service.skipReason) {
      return `○ ${service.displayName} (${service.skipReason})`;
    }
    // Defensive: a service that was publishable but did not get mirrored
    // for any reason. Should not happen in practice, but a clear log
    // line is better than silent loss.
    return `? ${service.displayName} (skipped, reason unknown)`;
  });

  const lines = [
    "─".repeat(50),
    "OpenAPI → Postman Sync",
    "",
    ...serviceLines,
    "",
    `Updated: ${updatedNames.length}`,
    `Skipped : ${services.length - updatedNames.length}`,
    "─".repeat(50),
  ];
  return lines.join("\n");
};

/**
 * Sync entry point.
 *
 * Order of operations matters for Postman's Native Git watcher:
 *
 * 1. Ensure `postman/specs/` exists (mkdir -p) so the watcher sees the
 *    directory as a stable path.
 * 2. Mirror every published service's `openapi.yaml` into its existing
 *    `<displayName>/openapi.yaml` path. If the file already exists, it is
 *    overwritten in place; the watcher sees a content modification of a
 *    tracked resource and leaves `.postman/resources.yaml` alone.
 * 3. Prune any `<displayName>/` directories that no longer correspond to a
 *    published service. Renamed or removed services are cleaned up, but
 *    only after step 2 has stabilised the live files.
 * 4. Emit the summary block via a single `process.stdout.write` so CI
 *    parsers don't interleave lines with other tasks' output.
 */
const main = (): void => {
  fs.mkdirSync(POSTMAN_SPECS_DIR, { recursive: true });

  const services = discoverServices();

  // Compute the mirror plan up front so we can build updatedNames with a
  // single allocation rather than pushing per iteration. The mirror side
  // effects themselves still run one-per-service in the second loop.
  const mirrorPlan = services.flatMap((service) => {
    if (!service.publish || !service.sourceSpecPath) return [];
    return [
      { source: service.sourceSpecPath, displayName: service.displayName },
    ];
  });

  for (const { source, displayName } of mirrorPlan) {
    const destinationPath = path.join(
      POSTMAN_SPECS_DIR,
      displayName,
      "openapi.yaml",
    );
    mirrorSpec(source, destinationPath);
  }

  const liveDisplayNames = new Set(
    mirrorPlan.map(({ displayName }) => displayName),
  );
  pruneStaleSpecDirs(liveDisplayNames);

  const updatedNames = mirrorPlan.map(({ displayName }) => displayName);

  process.stdout.write(renderSummary(services, updatedNames) + "\n");
};

main();
