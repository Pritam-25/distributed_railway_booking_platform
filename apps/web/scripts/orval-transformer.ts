/**
 * Orval Input Transformer
 *
 * Performs two passes over the merged gateway spec consumed by orval:
 *
 *   1. **Error component deduplication.** Collapses every error response in
 *      the spec into a single shared `ErrorResponse` reference so that orval
 *      produces one `ErrorResponse` TypeScript type rather than one duplicate
 *      file per endpoint and per status code (`login401.ts`, `sendOtp409Error.ts`).
 *
 *      Detection has two paths:
 *
 *        a. Named components (`BadRequestErrorResponse`,
 *           `RateLimitErrorResponse`, …) registered as
 *           `x-sdk-ref: "ErrorResponse"` in `components.schemas`. The
 *           `processResponseMediaType` helper matches these by `$ref` and
 *           rewrites them to `ErrorResponse`. After rewriting, the named
 *           components are removed from `components.schemas` so orval does
 *           not emit a TypeScript file per variant.
 *
 *        b. Inline error envelopes (anonymous schemas with
 *           `properties.success (false) + properties.error + properties.meta`).
 *           These occur in `registry.ts` where `createErrorResponseSchema(...)`
 *           is called without a `schemaName` argument. The transformer's
 *           `processResponseMediaType` matches these structurally and rewrites
 *           them to `ErrorResponse` as well.
 *
 *      Per-endpoint examples are extracted from both paths and attached to
 *      the media type so the generated SDK and the rendered spec still
 *      surface them.
 *
 *   2. **Per-service SDK gating.** Reads `scripts/services.config.ts` and
 *      drops every operation whose tags belong to a service with
 *      `generateSdk: false`. The flag is a per-service switch: a service can
 *      appear in the merged gateway contract and Postman mirror while its
 *      frontend client code is deferred. Today this means admin-service is
 *      part of the platform API but no admin client is generated for `apps/web`.
 *
 *      Dropping a path automatically drops its referenced schemas too
 *      because the second pass prunes `components.schemas` of every schema
 *      with no surviving `$ref` (or `x-sdk-ref`) target. Shared components
 *      like `ErrorResponse`, `EmptyResponse`, `ResponseMeta` survive because
 *      other paths still reference them.
 *
 * Why this transformer is the right place for both passes:
 *   - `ErrorResponse` deduplication is an orval-specific concern (orval does
 *     not understand the `x-sdk-ref` marker) and so belongs here.
 *   - Per-service SDK gating is also an orval-specific concern: the merged
 *     gateway spec is the public contract, and the filtering is a
 *     frontend-codegen convenience. Doing it in the orval transformer keeps
 *     the public spec untouched and avoids a separate preprocessing script.
 */

import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

type HttpMethod =
  "get" | "post" | "put" | "patch" | "delete" | "options" | "head"

type OpenApiSchema = {
  properties?: Record<string, OpenApiSchema>
  example?: unknown
  enum?: readonly unknown[]
  $ref?: string
  type?: string
  [key: string]: unknown
}

type MediaTypeObject = {
  schema?: OpenApiSchema
  example?: unknown
  [key: string]: unknown
}

type ResponseObject = {
  content?: {
    "application/json"?: MediaTypeObject
    [key: string]: MediaTypeObject | undefined
  }
  [key: string]: unknown
}

type OperationObject = {
  responses?: Record<string, ResponseObject>
  tags?: string[]
  [key: string]: unknown
}

type PathItemObject = Partial<Record<HttpMethod, OperationObject>> &
  Record<string, unknown>

type OpenAPIObject = {
  components?: {
    schemas?: Record<string, OpenApiSchema>
    [key: string]: unknown
  }
  paths?: Record<string, PathItemObject>
}

const ERROR_RESPONSE_REF = "#/components/schemas/ErrorResponse"
const SCHEMA_REF_PREFIX = "#/components/schemas/"
const SDK_REF_MARKER = "x-sdk-ref"
const HTTP_METHODS: readonly HttpMethod[] = [
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "options",
  "head",
] as const

/**
 * Names of components that should be preserved in `components.schemas` even
 * after deduplication. `ErrorResponse` is the target that the rewrite points
 * at; `ErrorDetail` is the nested type carried by every error envelope.
 */
const PRESERVED_COMPONENT_NAMES = new Set(["ErrorResponse", "ErrorDetail"])

// ─── Service metadata loader ──────────────────────────────────────────────────

const SERVICE_BLOCK_SPLIT_REGEX = /\n[ \t]*"[^"\r\n]+":[ \t]*\{/

/**
 * Extract block content up to the matching closing brace at brace depth 1.
 */
const extractBlockContent = (block: string): string => {
  let depth = 1
  let end = 0
  for (; end < block.length && depth > 0; end++) {
    const ch = block[end]
    if (ch === "{") depth += 1
    else if (ch === "}") depth -= 1
  }
  return block.slice(0, end - 1)
}

/**
 * Harvest excluded tags from a service configuration entry block if generateSdk is false.
 */
const harvestTagsFromEntry = (entry: string, excluded: Set<string>): void => {
  if (!/generateSdk:[ \t]*false\b/.test(entry)) return

  const tagsMatch = /tags:[ \t]*\[([^\]]*)\]/.exec(entry)
  if (!tagsMatch?.[1]) return

  const tagList = tagsMatch[1]
  for (const raw of tagList.split(",")) {
    const tag = raw.replace(/["'\s]/g, "").trim()
    if (tag.length > 0) excluded.add(tag)
  }
}

/**
 * Read `scripts/services.config.ts` synchronously and extract every tag
 * emitted by a service with `generateSdk: false`. The transformer lives in
 * `apps/web/scripts/orval-transformer.ts`; the config sits three directories
 * up at the repo root.
 *
 * We do a minimal parse of the TypeScript source because the file exports a
 * plain object literal. The compiler isn't available inside orval's
 * transformer (it runs through tsx), and importing the module would pull in
 * `@irctc/openapi` and `zod` for no benefit. The tag extraction is a pure
 * string search, which is sufficient because the config file is a stable
 * shape we control.
 */
const loadExcludedTags = (): Set<string> => {
  const here = dirname(fileURLToPath(import.meta.url))
  const configPath = resolve(
    here,
    "..",
    "..",
    "..",
    "scripts",
    "services.config.ts"
  )
  const source = readFileSync(configPath, "utf-8")

  const excluded = new Set<string>()
  const blocks = source.split(SERVICE_BLOCK_SPLIT_REGEX).slice(1)

  for (const block of blocks) {
    const entry = extractBlockContent(block)
    harvestTagsFromEntry(entry, excluded)
  }

  return excluded
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build an example object from a schema's inline property examples.
 * Walks `properties` and collects each field's `example` value.
 */
function extractExampleFromSchema(
  schema: OpenApiSchema
): Record<string, unknown> | undefined {
  const properties = schema.properties
  if (!properties) return undefined

  const example: Record<string, unknown> = {}
  let hasAny = false

  for (const [key, prop] of Object.entries(properties)) {
    if (prop.example !== undefined) {
      example[key] = prop.example
      hasAny = true
    } else if (prop.properties) {
      const nested = extractExampleFromSchema(prop)
      if (nested) {
        example[key] = nested
        hasAny = true
      }
    }
  }

  return hasAny ? example : undefined
}

/**
 * Check whether an inline schema matches the error envelope shape:
 * `{ properties: { success (false), error, meta } }`. The `x-sdk-ref` shortcut
 * is not used here because inline envelopes don't carry it.
 */
function isInlineErrorEnvelope(schema: OpenApiSchema): boolean {
  const properties = schema.properties
  if (!properties) return false

  const successProp = properties.success
  const isSuccessFalse =
    successProp?.enum?.includes(false) || successProp?.example === false

  return Boolean(isSuccessFalse && properties.error && properties.meta)
}

/**
 * Rewrite a single response media type to point at `ErrorResponse`. Returns
 * `true` if the rewrite happened so the caller can short-circuit.
 */
function processResponseMediaType(
  mediaType: MediaTypeObject,
  componentExamples: Map<string, Record<string, unknown>>
): boolean {
  const schema = mediaType?.schema
  if (!schema) return false

  // Case A: $ref to a named error component.
  if (schema.$ref) {
    const refName = schema.$ref.replace(SCHEMA_REF_PREFIX, "")
    if (PRESERVED_COMPONENT_NAMES.has(refName)) return false
    if (!componentExamples.has(refName)) return false

    const example = componentExamples.get(refName)
    if (example && !mediaType.example) {
      mediaType.example = example
    }
    mediaType.schema = { $ref: ERROR_RESPONSE_REF }
    return true
  }

  // Case B: inline error envelope.
  if (isInlineErrorEnvelope(schema)) {
    const example = extractExampleFromSchema(schema)
    if (example && !mediaType.example) {
      mediaType.example = example
    }
    mediaType.schema = { $ref: ERROR_RESPONSE_REF }
    return true
  }

  return false
}

/**
 * Walk every path response and rewrite error schemas to `ErrorResponse`.
 */
function rewriteErrorResponses(
  paths: Record<string, PathItemObject>,
  componentExamples: Map<string, Record<string, unknown>>
): void {
  for (const pathItem of Object.values(paths)) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method]
      if (!operation?.responses) continue

      for (const response of Object.values(operation.responses)) {
        const mediaType = response?.content?.["application/json"]
        if (mediaType) {
          processResponseMediaType(mediaType, componentExamples)
        }
      }
    }
  }
}

// ─── Tag-based path filtering ─────────────────────────────────────────────────

/**
 * Walk a path item and return true if any operation on the path carries an
 * excluded tag. Per-operation tagging is the granular rule; in practice every
 * path carries one tag today, but the function is written for the general
 * case so future multi-operation paths behave correctly.
 */
function pathHasExcludedTag(
  pathItem: PathItemObject,
  excludedTags: Set<string>
): boolean {
  for (const operation of Object.values(pathItem)) {
    if (!operation || typeof operation !== "object") continue
    const tags = (operation as { tags?: string[] }).tags
    if (!tags) continue
    if (tags.some((tag) => excludedTags.has(tag))) {
      return true
    }
  }
  return false
}

/**
 * Drop every path whose operations have an excluded tag. Returns the count of
 * removed paths.
 */
function dropExcludedPaths(
  paths: Record<string, PathItemObject>,
  excludedTags: Set<string>
): number {
  let removed = 0
  for (const [pathKey, pathItem] of Object.entries(paths)) {
    if (pathHasExcludedTag(pathItem, excludedTags)) {
      delete paths[pathKey]
      removed += 1
    }
  }
  return removed
}

// ─── Component pruning ────────────────────────────────────────────────────────

/**
 * Collect every `#/components/schemas/<name>` reference target reachable from
 * `root`, plus any `x-sdk-ref: "<SchemaName>"` markers. The latter is the
 * shortcut emitted by `createErrorResponseSchema` so per-status variants
 * like `BadRequestErrorResponse` can point at the shared `ErrorResponse`
 * without a `$ref` cycle.
 */
function collectSchemaRefs(root: unknown): Set<string> {
  const refs = new Set<string>()
  const visit = (node: unknown): void => {
    if (!node || typeof node !== "object") return
    if (Array.isArray(node)) {
      for (const item of node) visit(item)
      return
    }
    const record = node as Record<string, unknown>
    if (typeof record.$ref === "string") {
      const ref = record.$ref
      if (ref.startsWith(SCHEMA_REF_PREFIX)) {
        refs.add(ref.slice(SCHEMA_REF_PREFIX.length))
      }
    }
    if (typeof record[SDK_REF_MARKER] === "string") {
      refs.add(record[SDK_REF_MARKER] as string)
    }
    for (const [key, value] of Object.entries(record)) {
      // Skip the schemas map itself — references inside the map are the
      // definition site, not a use-site, and recursing would mark every
      // schema as referenced via its own keys.
      if (key === "schemas") continue
      visit(value)
    }
  }
  visit(root)
  return refs
}

const expandReachableFrontier = (
  schemas: Record<string, OpenApiSchema>,
  reachability: Set<string>
): void => {
  let frontier = [...reachability]
  while (frontier.length > 0) {
    const next: string[] = []
    for (const name of frontier) {
      const schema = schemas[name]
      if (!schema || typeof schema !== "object") continue
      for (const ref of collectSchemaRefs(schema)) {
        if (!reachability.has(ref)) {
          reachability.add(ref)
          next.push(ref)
        }
      }
    }
    frontier = next
  }
}

const deleteUnreachableSchemas = (
  schemas: Record<string, OpenApiSchema>,
  reachability: Set<string>
): number => {
  let removed = 0
  for (const name of Object.keys(schemas)) {
    if (reachability.has(name)) continue
    delete schemas[name]
    removed += 1
  }
  return removed
}

/**
 * Remove schemas from `components.schemas` whose names are not reachable
 * from anything outside the schemas map. A schema is reachable if it is
 * referenced by a surviving path, by another surviving top-level field
 * (e.g. webhooks, parameters), or by another surviving schema.
 */
function pruneOrphanSchemas(spec: OpenAPIObject): number {
  const schemas = spec.components?.schemas
  if (!schemas) return 0

  // Seed reachability from everything OUTSIDE `components.schemas`. We pass
  // the spec with `components` replaced by an empty object so the visitor
  // never descends into the schemas map at this step.
  const seedRoot: OpenAPIObject = { ...spec, components: {} }
  const reachability = collectSchemaRefs(seedRoot)

  // Close over `components.schemas`: a reachable schema can rescue another
  // schema it references. Iterate the frontier until it stops growing.
  expandReachableFrontier(schemas, reachability)

  return deleteUnreachableSchemas(schemas, reachability)
}

// ─── Core Transformer ─────────────────────────────────────────────────────────

const applyServiceGating = (spec: OpenAPIObject): void => {
  const excludedTags = loadExcludedTags()
  if (!spec.paths || excludedTags.size === 0) return

  const dropped = dropExcludedPaths(spec.paths, excludedTags)
  if (dropped > 0) {
    // After dropping paths, prune the schemas that lose their only
    // references (e.g. admin models that nothing else referenced).
    pruneOrphanSchemas(spec)
  }
}

const deduplicateErrorComponents = (spec: OpenAPIObject): void => {
  const schemas = spec.components?.schemas
  if (!schemas) return

  const componentExamples = new Map<string, Record<string, unknown>>()
  const deduplicatedNames: string[] = []

  for (const [name, schema] of Object.entries(schemas)) {
    if (PRESERVED_COMPONENT_NAMES.has(name)) continue

    // Authoritative marker: error variants are tagged with
    // `x-sdk-ref: "ErrorResponse"` by `createErrorResponseSchema`.
    if (schema[SDK_REF_MARKER] !== "ErrorResponse") continue

    const example = extractExampleFromSchema(schema)
    if (example) {
      componentExamples.set(name, example)
    }
    deduplicatedNames.push(name)
  }

  if (spec.paths) {
    rewriteErrorResponses(spec.paths, componentExamples)
  }

  // Remove the deduplicated variants from `components.schemas` so that
  // orval does not emit a TypeScript file per error variant.
  for (const name of deduplicatedNames) {
    delete schemas[name]
  }
}

/**
 * Orval Input Transformer entry point.
 */
export default function transformOpenApiSpec(
  inputSpec: OpenAPIObject
): OpenAPIObject {
  const spec = structuredClone(inputSpec)

  // Pass 1: per-service SDK gating. Drop paths whose tags are excluded
  // before orval sees them, so the generated client doesn't import them.
  applyServiceGating(spec)

  // Pass 2: error component deduplication. The existing logic is unchanged;
  // it runs after the gating pass so it sees the same shape as before.
  deduplicateErrorComponents(spec)

  return spec
}
