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
 * Serve interactive Scalar UI documentation
 */
docsRouter.use(
  "/docs",
  (_req, res, next) => {
    // Disable restrictive CSP for Scalar UI assets
    res.removeHeader("Content-Security-Policy");
    res.removeHeader("Cross-Origin-Opener-Policy");
    next();
  },
  apiReference({
    theme: "purple",
    spec: {
      url: "/openapi.json",
    },
  }),
);

export { docsRouter };
