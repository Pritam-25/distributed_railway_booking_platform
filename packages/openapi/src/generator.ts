import { OpenApiGeneratorV31 } from "@asteasolutions/zod-to-openapi";

export interface OpenApiDocConfig {
  info: {
    title: string;
    version: string;
    description?: string;
  };
  servers?: Array<{
    url: string;
    description?: string;
  }>;
}

export function createOpenApiDocument(
  definitions: any[],
  config: OpenApiDocConfig,
): any {
  const generator = new OpenApiGeneratorV31(definitions);
  return generator.generateDocument({
    openapi: "3.1.0",
    info: config.info,
    servers: config.servers,
  });
}
