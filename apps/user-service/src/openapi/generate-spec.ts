import { registry } from "./registry.js";
import { createOpenApiDocument } from "@irctc/openapi";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

try {
  const openapiDocument = createOpenApiDocument(registry.definitions, {
    info: {
      title: "User Service API",
      version: "1.0.0",
      description:
        "Microservice for managing users, authentication, OTPs, and user sessions",
    },
    servers: [
      {
        url: "http://localhost:4001",
        description: "Local Direct Service URL",
      },
      {
        url: "http://localhost:4000/user-service",
        description: "API Gateway Proxy URL",
      },
    ],
  });

  const outputPath = path.resolve(__dirname, "../../openapi.json");
  fs.writeFileSync(
    outputPath,
    JSON.stringify(openapiDocument, null, 2),
    "utf-8",
  );
  console.log(
    `✅ user-service openapi.json generated successfully at ${outputPath}`,
  );
} catch (err: any) {
  console.error("❌ Spec Generation Error details:");
  console.dir(err, { depth: 10 });
  process.exit(1);
}
