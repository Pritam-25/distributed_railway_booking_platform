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
      description: `
# User Service API

Microservice handling authentication, identity management, OTP verification, and user sessions for the IRCTC Railway Booking Platform.

## Core Capabilities

- **Registration & Verification**: Multi-step signup with 6-digit email OTP verification.
- **Authentication**: JWT Access Tokens (Bearer / Cookie) and Refresh Token rotation.
- **Session Management**: Active session tracking, single session revoke, and global logout-all.
- **Password Management**: Self-service OTP password resets.

## Authentication Schemes

- **Bearer JWT**: \`Authorization: Bearer <access_token>\`
- **Cookie Auth**: \`access_token\` HTTP-only cookie
`,
    },
    servers: [
      {
        url: "http://localhost:4000/user-service",
        description: "API Gateway Proxy URL",
      },
      {
        url: "http://localhost:4001",
        description: "Local Direct Service URL",
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
