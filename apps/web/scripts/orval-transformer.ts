type OpenAPIObject = Record<string, any>

/**
 * Orval Input Transformer — Error Schema Deduplication
 *
 * Replaces all error response schemas with a shared `$ref` to `#/components/schemas/ErrorResponse`,
 * using `allOf` composition to preserve endpoint-specific examples in documentation.
 *
 * Identifies error schemas by:
 * 1. Explicit `x-sdk-ref: "ErrorResponse"` vendor tag if present
 * 2. Structural detection: `properties.success` (false) + `properties.error` + `properties.meta`
 *
 * This eliminates duplicate model files like `Login401.ts`, `SendOtp409Error.ts`,
 * `BadRequestErrorResponse.ts`, etc. — all structurally identical to `ErrorResponse`.
 */

const ERROR_RESPONSE_REF = "#/components/schemas/ErrorResponse"
const RESPONSE_META_REF = "#/components/schemas/ResponseMeta"
const HTTP_METHODS = [
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "options",
  "head",
] as const

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build an example object from a schema's inline property examples.
 * Walks `properties` and collects each field's `example` value.
 */
function extractExampleFromSchema(
  schema: Record<string, any>
): Record<string, any> | undefined {
  if (!schema.properties) return undefined

  const example: Record<string, any> = {}
  let hasAny = false

  for (const [key, prop] of Object.entries<any>(schema.properties)) {
    if (prop.example !== undefined) {
      example[key] = prop.example
      hasAny = true
    } else if (prop.enum?.length === 1) {
      example[key] = prop.enum[0]
      hasAny = true
    } else if (prop.properties) {
      const nested = extractExampleFromSchema(prop)
      if (nested) {
        example[key] = nested
        hasAny = true
      }
    } else if (prop.$ref === RESPONSE_META_REF) {
      example[key] = {
        requestId: "3e3c1f1a-6f7d-4a2b-9b5c-1f0e3a4b5c6d",
        traceId: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
        timestamp: new Date().toISOString(),
      }
      hasAny = true
    }
  }

  return hasAny ? example : undefined
}

/**
 * Check whether a schema (inline or named component) is an error response envelope.
 * Matches if `x-sdk-ref === "ErrorResponse"` OR matches structural pattern:
 * `{ properties: { success (false), error, meta } }`.
 */
function isErrorEnvelopeSchema(schema: Record<string, any>): boolean {
  if (!schema || typeof schema !== "object" || !schema.properties) return false

  if (schema["x-sdk-ref"] === "ErrorResponse") return true

  const props = schema.properties
  const isSuccessFalse =
    props.success?.enum?.includes(false) ||
    props.success?.example === false ||
    props.success?.type === "boolean" // when enum is false

  const hasErrorProp = Boolean(props.error)
  const hasMetaProp = Boolean(props.meta)

  return Boolean(isSuccessFalse && hasErrorProp && hasMetaProp)
}

/**
 * Phase 1: Collect error response component schemas to be deduplicated.
 */
function collectErrorComponents(schemas: Record<string, any>): {
  taggedComponentNames: Set<string>
  componentExamples: Map<string, Record<string, any>>
} {
  const taggedComponentNames = new Set<string>()
  const componentExamples = new Map<string, Record<string, any>>()

  for (const [name, schema] of Object.entries<any>(schemas)) {
    if (name === "ErrorResponse" || name === "ErrorDetail") continue

    if (isErrorEnvelopeSchema(schema)) {
      taggedComponentNames.add(name)
      const example = extractExampleFromSchema(schema)
      if (example) {
        componentExamples.set(name, example)
      }
    }
  }

  return { taggedComponentNames, componentExamples }
}

/**
 * Process a single response media type object to rewrite error schemas.
 */
function processResponseMediaType(
  mediaType: Record<string, any>,
  taggedComponentNames: Set<string>,
  componentExamples: Map<string, Record<string, any>>
): void {
  const schema = mediaType?.schema
  if (!schema) return

  // Case A: Schema is a $ref to a tagged/error named component
  if (schema.$ref) {
    const refName = schema.$ref.replace("#/components/schemas/", "")
    if (taggedComponentNames.has(refName)) {
      mediaType.schema = { allOf: [{ $ref: ERROR_RESPONSE_REF }] }
      const example = componentExamples.get(refName)
      if (example && !mediaType.example) {
        mediaType.example = example
      }
    }
    return
  }

  // Case B: Schema is an inline error schema
  if (isErrorEnvelopeSchema(schema)) {
    const example = extractExampleFromSchema(schema)
    mediaType.schema = { allOf: [{ $ref: ERROR_RESPONSE_REF }] }
    if (example && !mediaType.example) {
      mediaType.example = example
    }
  }
}

/**
 * Phase 2: Rewrite all path response schemas in the OpenAPI specification.
 */
function rewritePathResponses(
  paths: Record<string, any>,
  taggedComponentNames: Set<string>,
  componentExamples: Map<string, Record<string, any>>
): void {
  for (const pathItem of Object.values<any>(paths)) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method]
      if (!operation?.responses) continue

      for (const response of Object.values<any>(operation.responses)) {
        const mediaType = response?.content?.["application/json"]
        if (mediaType) {
          processResponseMediaType(
            mediaType,
            taggedComponentNames,
            componentExamples
          )
        }
      }
    }
  }
}

/**
 * Phase 3: Delete component schemas that were deduplicated into ErrorResponse.
 */
function removeDeduplicatedComponents(
  schemas: Record<string, any>,
  componentNames: Set<string>
): void {
  for (const name of componentNames) {
    delete schemas[name]
  }
}

// ─── Core Transformer ─────────────────────────────────────────────────────────

/**
 * Orval Input Transformer entry point.
 */
export default function transformOpenApiSpec(
  inputSpec: OpenAPIObject
): OpenAPIObject {
  const spec = structuredClone(inputSpec)
  const schemas = spec.components?.schemas as Record<string, any> | undefined

  if (!schemas) return spec

  const { taggedComponentNames, componentExamples } =
    collectErrorComponents(schemas)

  if (spec.paths) {
    rewritePathResponses(spec.paths, taggedComponentNames, componentExamples)
  }

  removeDeduplicatedComponents(schemas, taggedComponentNames)

  return spec
}
