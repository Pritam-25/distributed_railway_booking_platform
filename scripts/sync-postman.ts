// sync-postman.ts
//
// Mirrors generated OpenAPI specifications from apps/<id>/openapi.yaml into
// Postman's Native Git workspace under postman/specs/<displayName>/openapi.yaml.
//
// ─── Direction of synchronization ────────────────────────────────────────────
//
//   Application source                 Postman workspace
//   ─────────────────                  ─────────────────
//   apps/<id>/openapi.yaml      →      postman/specs/<displayName>/openapi.yaml
//                                       │
//                                       │ postman workspace push
//                                       ▼
//                                    Postman Cloud
//
//   apps/<id>/openapi.yaml is the source of truth. postman/specs/ is the
//   local mirror managed by this script. Postman's Native Git treats the
//   postman/ directory as its local workspace representation; this script
//   keeps that representation in sync with the generated application specs.
//
// ─── Why this script ─────────────────────────────────────────────────────────
//
//   In a microservice monorepo, every service generates its own OpenAPI spec
//   from a Zod registry. The combined system is exposed via the API gateway,
//   whose build:spec task already aggregates upstream service specs. The
//   Postman workspace, however, expects one spec per directory under
//   postman/specs/. This script bridges that gap by mirroring each generated
//   spec into its own Postman directory.
//
// ─── Behavior ────────────────────────────────────────────────────────────────
//
//   - Discovery: scans apps/<id>/openapi.yaml for every workspace app. This
//     is glob-style discovery so adding a new service app automatically
//     participates in the report (visible in CI logs) without editing a list.
//
//   - Metadata: each discovered service is enriched from
//     scripts/services.config.ts. Services absent from that map are treated
//     as publish: false — their specs are NOT mirrored, but they DO appear
//     in the summary so the omission is visible.
//
//   - Mirroring is idempotent and unconditional. If the destination file does
//     not match the source (e.g. a stale copy from a previous deployment), it
//     is overwritten. Manual edits to postman/specs/... are discarded; that
//     directory is a managed mirror, not an editable workspace.
//
//   - Line endings are preserved from the source file. The user-service spec
//     generator currently emits CRLF; the gateway spec is regenerated on every
//     build:spec. We do not re-encode — the mirror is byte-faithful.
//
// ─── Out of scope for this script ────────────────────────────────────────────
//
//   - .postman/resources.yaml — managed by Postman; do not edit here.
//   - .postman/workflows.yaml — managed by Postman; do not edit here.
//   - Multi-spec OpenAPI merge — the gateway currently copies a single spec;
//     a real multi-source merge is a separate change once multiple services
//     generate specs.
//
// ─── Invocation ──────────────────────────────────────────────────────────────
//
//   Direct:    pnpm exec tsx scripts/sync-postman.ts
//   Pipeline:  pnpm docs          # runs turbo run sync:postman
//
//   The Turbo task sync:postman declares dependsOn: [api-gateway#build:spec],
//   and the gateway build:spec task transitively depends on each upstream
//   service's build:spec. When new services are added to the public API
//   surface, the gateway's dependsOn list must be extended in turbo.json so
//   this script's run remains ordered correctly. The gateway task is the
//   single source of truth for the build graph — this script does not
//   independently attempt to schedule upstream service builds.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SERVICES } from "./services.config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Repository root is the parent of scripts/. This script does its own path
// resolution rather than relying on process.cwd() so it can be invoked from
// any directory.
const REPO_ROOT = path.resolve(__dirname, "..");
const APPS_DIR = path.join(REPO_ROOT, "apps");
const POSTMAN_SPECS_DIR = path.join(REPO_ROOT, "postman", "specs");

// Stable display name when no metadata entry exists for a discovered service.
// We derive a Title-Case form from the workspace id so that, even on
// publish: false services, the summary log reads cleanly.
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

type DiscoveredService = {
  // Workspace id, e.g. user-service
  id: string;
  // Resolved display name, e.g. User Service API
  displayName: string;
  // Whether this service's spec should be mirrored
  publish: boolean;
  // Absolute path to apps/<id>/openapi.yaml, or null when missing
  sourceSpecPath: string | null;
  // Reason for skipping (only set when not published)
  skipReason: string | null;
};

// Walk apps/* and return one record per app directory, regardless of
// whether it has a generated spec yet. Services are matched against the
// SERVICES metadata map; missing entries get safe defaults.
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

// Mirror a single source spec to its destination. Preserves the source
// encoding (we use Buffer round-trip rather than readFileSync as UTF-8
// string + writeFileSync as UTF-8 string, which can re-encode line endings
// inconsistently across Node versions on Windows).
const mirrorSpec = (sourcePath: string, destinationPath: string): void => {
  const bytes = fs.readFileSync(sourcePath);
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.writeFileSync(destinationPath, bytes);
};

// Render the summary block in the agreed shape:
//
//   ──────────────────────────────────
//   OpenAPI → Postman Sync
//
//   ✓ User Service API
//   ✓ API Gateway
//   ○ Booking Service API   (no openapi.yaml)
//   ○ Payment Service API   (publish=false)
//
//   Updated: 2
//   Skipped : 3
//   ──────────────────────────────────
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

const main = (): void => {
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

  const updatedNames = mirrorPlan.map(({ displayName }) => displayName);

  // Print summary. We deliberately use process.stdout.write (rather than
  // console.log) so the entire block is one write and CI parsers don't
  // interleave lines with other tasks' output.
  process.stdout.write(renderSummary(services, updatedNames) + "\n");
};

main();
