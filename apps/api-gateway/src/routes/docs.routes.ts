import { Router } from "express";
import { apiReference } from "@scalar/express-api-reference";
import fs from "node:fs";
import path from "node:path";

const docsRouter: Router = Router();

/**
 * Locate openapi.json file (Gateway merged or User Service)
 */
const getOpenApiSpecPath = (): string => {
  const gatewaySpecPath = path.resolve(process.cwd(), "openapi.json");
  if (fs.existsSync(gatewaySpecPath)) {
    return gatewaySpecPath;
  }
  const userServiceSpecPath = path.resolve(
    process.cwd(),
    "../user-service/openapi.json",
  );
  if (fs.existsSync(userServiceSpecPath)) {
    return userServiceSpecPath;
  }
  return gatewaySpecPath;
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
