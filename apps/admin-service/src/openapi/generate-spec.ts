import { registry } from "./registry.js";
import { createOpenApiDocument } from "@irctc/openapi";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";
import { apiDescription, apiTitle, apiVersion } from "./descriptions.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

try {
  const openapiDocument = createOpenApiDocument(registry.definitions, {
    info: {
      title: apiTitle,
      version: apiVersion,
      description: apiDescription,
    },
    servers: [
      {
        url: "http://localhost:4000",
        description: "API Gateway Proxy URL",
      },
      {
        url: "http://localhost:4002",
        description: "Local Direct Admin Service URL",
      },
    ],
  });

  /*
  const outputPath = path.resolve(__dirname, "../../openapi.json");
  
  fs.writeFileSync(
    outputPath,
    JSON.stringify(openapiDocument, null, 2),
    "utf-8",
  );
  */

  const yamlOutputPath = path.resolve(__dirname, "../../openapi.yaml");

  fs.writeFileSync(
    yamlOutputPath,
    yaml.dump(openapiDocument, {
      lineWidth: 120,
      noRefs: true,
      sortKeys: false,
    }),
    "utf-8",
  );
  console.log(
    // `✅ admin-service openapi spec generated:\n   ${outputPath}\n   ${yamlOutputPath}`,
    `✅ admin-service openapi spec generated:\n ${yamlOutputPath}`,
  );
} catch (err: unknown) {
  console.error("❌ Spec Generation Error details:");
  console.dir(err, { depth: 10 });
  process.exit(1);
}
