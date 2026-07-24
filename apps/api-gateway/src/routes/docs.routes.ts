import { Router } from "express";
import { apiReference } from "@scalar/express-api-reference";
import fs from "node:fs";
import path from "node:path";
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
 * Build Scalar UI API Reference middleware with spec content embedded
 */
const createScalarMiddleware = () => {
  const specPath = getOpenApiSpecPath();
  let specContent: Record<string, unknown> = {};
  if (fs.existsSync(specPath)) {
    try {
      specContent = JSON.parse(fs.readFileSync(specPath, "utf-8")) as Record<
        string,
        unknown
      >;
    } catch (err) {
      console.error("Failed to parse OpenAPI spec for Scalar UI:", err);
    }
  }

  return apiReference({
    theme: "deepSpace",
    spec: {
      content: specContent,
    },
  });
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
 * GET /docs
 * Serve interactive Scalar UI documentation with embedded spec
 */
docsRouter.use(
  "/docs",
  (_req, res, next) => {
    // Disable restrictive Helmet CSP & COOP headers so Scalar UI client bundle can render
    res.removeHeader("Content-Security-Policy");
    res.removeHeader("Cross-Origin-Opener-Policy");
    next();
  },
  createScalarMiddleware(),
);

export { docsRouter };
