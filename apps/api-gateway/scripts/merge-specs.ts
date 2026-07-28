// merge-specs.ts
//
// Merges per-service OpenAPI specs into a unified gateway contract using
// `@redocly/cli join`, then post-processes the result so the gateway spec
// represents the platform instead of inheriting the first input's metadata.
//
// ─── Direction of merging ────────────────────────────────────────────────────
//
//   apps/user-service/openapi.yaml      ─┐
//                                       │
//   apps/admin-service/openapi.yaml     ─┼──>  redocly join  ──>  apps/api-gateway/openapi.yaml
//                                       │       (multi-input, deep-merge)
//   (any future service)                ─┘
//
//   Output is byte-faithful to what redocly produces for the YAML/JSON body,
//   except `info.title`, `info.version`, and `info.description`, which are
//   rewritten so the gateway spec represents the platform.
//
// ─── Why this script ─────────────────────────────────────────────────────────
//
//   `redocly join` is built specifically for combining independent OpenAPI
//   documents into one unified description. Per-component collisions (e.g.
//   `ErrorResponse` defined identically by both services) merge silently
//   because both files emit byte-identical definitions via @irctc/openapi.
//
// ─── Behavior ────────────────────────────────────────────────────────────────
//
//   - Discovery: scans apps/*/openapi.yaml for every service listed in
//     `scripts/services.config.ts` with `publish: true`. Glob-style discovery
//     keeps the merge order explicit while still being self-maintaining.
//
//   - Merge invocation: `redocly join <inputs...> -o <yaml-output>`. Outputs
//     YAML by default; we then read it back as JSON and write `openapi.json`
//     so both formats are produced (matching the gateway contract used by
//     Scalar's `/docs` handler and any non-Postman consumers).
//
//   - Info override: redocly's `join` keeps the first input's `info` block.
//     That's almost always the wrong title for a multi-service API — the
//     gateway spec would otherwise be titled after whichever service is
//     listed first. We rewrite `info.title`, `info.version`, and
//     `info.description` in place after the merge.
//
// ─── Out of scope ────────────────────────────────────────────────────────────
//
//   - Linting during merge — `@redocly/cli`'s lint pass is opt-in via
//     --lint-config; we keep merge-specs minimal and accept whatever joined
//     output redocly produces. Lint as a separate CI step.
//
// ─── Invocation ──────────────────────────────────────────────────────────────
//
//   Direct:    pnpm exec tsx scripts/merge-specs.ts
//   Pipeline:  turbo run api-gateway#build:spec
//
//   The Turbo task `api-gateway#build:spec` declares dependsOn:
//     [user-service#build:spec, admin-service#build:spec]
//   so the per-service specs exist before this script runs. Add new services
//   to that list as they adopt their own generate-spec step.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { SERVICES } from "../../../scripts/services.config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO_ROOT = path.resolve(__dirname, "../../..");
const APPS_DIR = path.join(REPO_ROOT, "apps");
const TARGET_DIR = path.resolve(__dirname, "..");
const TARGET_JSON = path.join(TARGET_DIR, "openapi.json");
const TARGET_YAML = path.join(TARGET_DIR, "openapi.yaml");

// Platform-level metadata that replaces whatever redocly carries through from
// the first input file. Keep these constants in this file (not config) — the
// gateway spec is the platform's public contract, not a deployable artifact.
const GATEWAY_INFO = {
  title: "Railway Booking Platform API",
  version: "1.0.0",
  description: `
  # Railway Booking Platform API

  Welcome to the **Railway Booking Platform API**. This document is the
  unified public API contract for the IRCTC Railway Booking Platform,
  combining every public endpoint exposed through the API Gateway.

  ## Services

  - **User Service** — Authentication, identity, and profile management.
  - **Admin Service** — Administrator authentication and administrative operations.
  - **Inventy Service** - Inventory Schedule Management. *(future)*
  - **Booking Service** — Seat reservation and booking lifecycle. *(future)*
  - **Search Service** — Train and station search. *(future)*
  - **Payment Service** — Payment processing. *(future)*
  - **Notification Service** — User-facing notifications. *(internal)*
`,
} as const;

type ServiceSpecSource = {
  id: string;
  specPath: string;
};

// Walk apps/*/openapi.yaml and pick up every service that:
//   1. Has publish: true in scripts/services.config.ts
//   2. Has mergeInput !== false (defaults to true)
//   3. Has an actual openapi.yaml on disk
//
// Order matters because redocly join keeps the first input's info block.
// We sort by display name so the order is deterministic across machines.
//
// The api-gateway itself is excluded by setting mergeInput: false in
// services.config.ts — including it would cause the merge to read its
// own previous output as an input, which is a self-reference at best and
// a circular consistency violation at worst.
const collectMergeInputs = (): ServiceSpecSource[] => {
  if (!fs.existsSync(APPS_DIR)) return [];

  const entries = fs.readdirSync(APPS_DIR, { withFileTypes: true });

  const sources: ServiceSpecSource[] = entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const metadata = SERVICES[entry.name];
      if (metadata?.publish !== true) return null;
      if (metadata.mergeInput === false) return null;

      const specPath = path.join(APPS_DIR, entry.name, "openapi.yaml");
      if (!fs.existsSync(specPath)) return null;

      return { id: entry.name, specPath };
    })
    .filter((source): source is ServiceSpecSource => source !== null);

  sources.sort((a, b) => {
    const nameA = SERVICES[a.id]?.displayName ?? a.id;
    const nameB = SERVICES[b.id]?.displayName ?? b.id;
    return nameA.localeCompare(nameB);
  });

  return sources;
};

// Run redocly join against the given input specs and write the result to
// the gateway's target YAML path. Output is the merged YAML; we'll read it
// back as JSON for the .json sibling.
//
// We invoke the binary via `pnpm exec` rather than the unqualified path
// `apps/api-gateway/node_modules/.bin/redocly(.cmd)` because on Windows,
// `child_process.execFileSync` against a `.cmd` shim can fail with EINVAL
// under certain Node versions. Routing through pnpm exec keeps the same
// pnpm-managed resolution but avoids the spawn constraint.
const runRedoclyJoin = (sources: ServiceSpecSource[]): void => {
  const redoclyArgs = [
    "join",
    ...sources.map((s) => path.relative(REPO_ROOT, s.specPath)),
    "--output",
    path.relative(REPO_ROOT, TARGET_YAML),
  ];
  console.log(`→ pnpm exec redocly ${redoclyArgs.join(" ")}`);

  try {
    execFileSync("pnpm", ["exec", "redocly", ...redoclyArgs], {
      stdio: ["ignore", "inherit", "inherit"],
      cwd: REPO_ROOT,
      shell: process.platform === "win32",
    });
  } catch (err) {
    console.error("❌ redocly join failed");
    throw err;
  }
};

// Read the joined YAML, overwrite the platform-level info block, write
// back as both YAML and JSON. Preserves the rest of the doc structurally
// — yaml.dump re-serializes, but the schema content is untouched.
const overrideInfoAndEmit = (): void => {
  const raw = fs.readFileSync(TARGET_YAML, "utf-8");
  const parsed = yaml.load(raw) as Record<string, unknown>;

  if (!parsed || typeof parsed !== "object") {
    throw new Error(`Joined spec is not an object: ${typeof parsed}`);
  }

  const existingInfo =
    parsed["info"] && typeof parsed["info"] === "object"
      ? (parsed["info"] as Record<string, unknown>)
      : {};

  parsed["info"] = {
    ...existingInfo,
    title: GATEWAY_INFO.title,
    version: GATEWAY_INFO.version,
    description: GATEWAY_INFO.description,
  };

  fs.writeFileSync(
    TARGET_YAML,
    yaml.dump(parsed, {
      lineWidth: 120,
      noRefs: true,
      sortKeys: false,
    }),
    "utf-8",
  );

  fs.writeFileSync(TARGET_JSON, JSON.stringify(parsed, null, 2), "utf-8");

  console.log(
    `✅ Gateway spec written: ${path.relative(REPO_ROOT, TARGET_YAML)} and ${path.relative(REPO_ROOT, TARGET_JSON)}`,
  );
};

const main = (): void => {
  const sources = collectMergeInputs();

  if (sources.length === 0) {
    console.log(
      "ℹ️ No service specs to merge. Generating an empty gateway spec.",
    );
    fs.mkdirSync(TARGET_DIR, { recursive: true });
    const empty = {
      openapi: "3.1.0",
      info: GATEWAY_INFO,
      paths: {},
      components: { schemas: {} },
    };
    fs.writeFileSync(
      TARGET_YAML,
      yaml.dump(empty, { lineWidth: 120, sortKeys: false }),
      "utf-8",
    );
    fs.writeFileSync(TARGET_JSON, JSON.stringify(empty, null, 2), "utf-8");
    return;
  }

  if (sources.length === 1) {
    // Skip the redocly child-process overhead when there's only one input;
    // still apply the info override so the gateway spec doesn't inherit
    // a service-specific title.
    const single = sources[0]!;
    console.log(
      `→ Single service ${single.id}; copying spec and overriding info.`,
    );
    fs.mkdirSync(TARGET_DIR, { recursive: true });
    fs.copyFileSync(single.specPath, TARGET_YAML);
    overrideInfoAndEmit();
    return;
  }

  runRedoclyJoin(sources);
  overrideInfoAndEmit();
};

main();
