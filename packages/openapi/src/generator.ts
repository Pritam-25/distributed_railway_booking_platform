import {
  OpenApiGeneratorV31,
  OpenAPIRegistry,
} from "@asteasolutions/zod-to-openapi";

/**
 * Full OpenAPI 3.1.0 document configuration payload expected by {@link OpenApiGeneratorV31}.
 */
export type OpenAPIObjectConfigV31 = Parameters<
  OpenApiGeneratorV31["generateDocument"]
>[0];

/**
 * Input configuration for generating an OpenAPI 3.1.0 document.
 * `openapi` version defaults to `"3.1.0"` if not explicitly provided.
 */
export type OpenApiDocConfig = Omit<OpenAPIObjectConfigV31, "openapi"> & {
  openapi?: string;
};

/**
 * Union type of all OpenAPI components, schemas, routes, and webhooks registered in an {@link OpenAPIRegistry}.
 */
export type OpenAPIDefinitions = OpenAPIRegistry["definitions"][number];

/**
 * Generated OpenAPI 3.1.0 specification document object.
 */
export type OpenAPIObject = ReturnType<OpenApiGeneratorV31["generateDocument"]>;

/**
 * ## createOpenApiDocument
 * Generates an OpenAPI 3.1.0 specification document from registered Zod schemas and route definitions.
 *
 * @remarks
 * Uses {@link OpenApiGeneratorV31} to convert Zod registry definitions into a compliant OpenAPI 3.1.0 JSON object structure.
 * Defaults the specification version to `"3.1.0"` when omitted in `config`.
 * @param definitions - Array of registered {@link OpenAPIDefinitions} exported from an {@link OpenAPIRegistry}.
 * @param config - OpenAPI document metadata configuration including API info, servers, and security.
 * @returns Complete {@link OpenAPIObject} specification document ready for JSON serialization.
 */
export function createOpenApiDocument(
  definitions: OpenAPIDefinitions[],
  config: OpenApiDocConfig,
): OpenAPIObject {
  // 1. Instantiate OpenAPI 3.1 generator with registry definitions
  const generator = new OpenApiGeneratorV31(definitions);

  // 2. Generate compliant OpenAPI 3.1.0 document
  return generator.generateDocument({
    openapi: "3.1.0",
    ...config,
  });
}
