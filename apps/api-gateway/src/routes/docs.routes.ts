import { Router, type Request } from "express";
import { apiReference } from "@scalar/express-api-reference";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { env } from "@config";

const docsRouter: Router = Router();

/**
 * Locate openapi.json file (Explicit ENV from env config, Deployed /deploy runtime artifact, or local dev fallback)
 */
const getOpenApiSpecPath = (): string => {
  // 1. Configured explicit environment variable path from validated env config
  if (env.OPENAPI_SPEC_PATH) {
    const envPath = path.resolve(env.OPENAPI_SPEC_PATH);
    if (fs.existsSync(envPath)) {
      return envPath;
    }
  }

  // 2. Deployed runtime artifact location (e.g. /deploy/openapi.json or process.cwd()/openapi.json)
  const artifactSpecPath = path.resolve(process.cwd(), "openapi.json");
  if (fs.existsSync(artifactSpecPath)) {
    return artifactSpecPath;
  }

  // 3. Local monorepo development mode fallback (relative path from apps/api-gateway to apps/user-service)
  const repoDevSpecPath = path.resolve(
    process.cwd(),
    "../user-service/openapi.json",
  );
  if (fs.existsSync(repoDevSpecPath)) {
    return repoDevSpecPath;
  }

  return artifactSpecPath;
};

/**
 * GET /openapi.json
 * Expose raw OpenAPI JSON specification
 */
docsRouter.get("/openapi.json", (_req, res) => {
  const specPath = getOpenApiSpecPath();
  if (fs.existsSync(specPath)) {
    const specContent = fs.readFileSync(specPath, "utf-8");
    res.setHeader("Content-Type", "application/json");
    res.send(specContent);
  } else {
    res.status(404).json({
      error: "OpenAPI specification not found. Run pnpm build:spec first.",
    });
  }
});

/**
 * Loads and parses the OpenAPI specification JSON file.
 * Returns null on parser, empty spec, or filesystem failures.
 */
const loadOpenApiSpec = (specPath: string): Record<string, unknown> | null => {
  if (!fs.existsSync(specPath)) {
    return null;
  }
  try {
    const content = fs.readFileSync(specPath, "utf-8");
    const parsed = JSON.parse(content) as Record<string, unknown>;
    if (!parsed || Object.keys(parsed).length === 0) {
      return null;
    }
    return parsed;
  } catch (err) {
    console.error("Failed to parse OpenAPI spec for Scalar UI:", err);
    return null;
  }
};

/**
 * Type guard / safe parser to extract the url string property from a spec server object.
 */
const getServerUrlStr = (server: unknown): string | null => {
  if (server && typeof server === "object" && "url" in server) {
    const urlVal = (server as Record<string, unknown>)["url"];
    if (typeof urlVal === "string") {
      return urlVal;
    }
  }
  return null;
};

/**
 * Dynamically resolves allowed connect-src origins based on request context,
 * upstream server environments, and servers configured in the OpenAPI specification.
 */
const getConnectSrcOrigins = (
  req: Request,
  specContent: Record<string, unknown>,
): string => {
  const allowedOrigins = new Set<string>(["'self'"]);

  // 1. Current gateway origin from request context
  try {
    allowedOrigins.add(`${req.protocol}://${req.get("host")}`);
  } catch {
    // Ignore parsing failures
  }

  // Helper to safely add an origin from a URL string
  const addOrigin = (urlStr?: string) => {
    if (urlStr) {
      try {
        allowedOrigins.add(new URL(urlStr).origin);
      } catch {
        // Ignore invalid URLs
      }
    }
  };

  // 2. Configured upstream origins from env
  addOrigin(env.USER_UPSTREAM);
  addOrigin(env.ADMIN_UPSTREAM);

  // 3. Known server URLs defined in openapi.json for Scalar's "Try it" panel
  const specServers = specContent["servers"];
  if (Array.isArray(specServers)) {
    for (const server of specServers) {
      const urlStr = getServerUrlStr(server);
      if (urlStr) {
        addOrigin(urlStr);
      }
    }
  }

  return Array.from(allowedOrigins).join(" ");
};

/**
 * GET /docs
 * Serve interactive Scalar UI documentation with embedded spec and request-specific CSP nonce
 */
docsRouter.use("/docs", (req, res, next) => {
  const specPath = getOpenApiSpecPath();
  const specContent = loadOpenApiSpec(specPath);

  if (!specContent) {
    res.status(503).json({
      error: "OpenAPI specification is unavailable. Run pnpm build:spec first.",
    });
    return;
  }

  const nonce = crypto.randomBytes(16).toString("base64");
  const connectSrcList = getConnectSrcOrigins(req, specContent);

  // Set secure CSP & COOP headers with refined connect-src origins
  res.setHeader(
    "Content-Security-Policy",
    `default-src 'self'; ` +
      `script-src 'self' 'nonce-${nonce}' https://cdn.jsdelivr.net; ` +
      `style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; ` +
      `font-src 'self' https://cdn.jsdelivr.net; ` +
      `img-src 'self' data: https://cdn.jsdelivr.net; ` +
      `connect-src ${connectSrcList}; ` +
      `frame-src 'self';`,
  );

  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");

  // Create the middleware instance dynamically with the request's unique nonce
  const scalarMiddleware = apiReference({
    theme: "deepSpace",
    spec: {
      content: specContent,
    },
    nonce,
  });

  scalarMiddleware(req as any, res as any, next);
});

export { docsRouter };
