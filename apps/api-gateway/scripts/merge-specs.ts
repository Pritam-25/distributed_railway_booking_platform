import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Discovers and merges/copies OpenAPI specifications from all microservices into api-gateway/openapi.json
 */
const SERVICES = [
  "user-service",
  "booking-service",
  "payment-service",
  "inventory-service",
  "admin-service",
];

function mergeSpecs() {
  const targetPath = path.resolve(__dirname, "../openapi.json");

  for (const service of SERVICES) {
    const serviceSpecPath = path.resolve(
      __dirname,
      `../../${service}/openapi.json`,
    );
    if (fs.existsSync(serviceSpecPath)) {
      fs.copyFileSync(serviceSpecPath, targetPath);
      console.log(
        `✅ Copied OpenAPI specification from ${service} to api-gateway/openapi.json`,
      );
      return;
    }
  }

  console.log("ℹ️ No microservice openapi.json found during spec resolution.");
}

mergeSpecs();
