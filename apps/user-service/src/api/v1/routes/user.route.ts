import { Router } from "express";
import { trustGatewayHeaders, sessionMiddleware } from "@middleware";
import { validateSchema, asyncHandler } from "@irctc/middleware";
import { userController } from "@container";
import { UpdateProfileSchema } from "@dto";

/**
 * Authenticated user profile routes.
 *
 * Registers HTTP endpoints under `/api/v1/users` for managing the
 * currently authenticated user's profile.
 *
 * ### Responsibilities
 * - Map profile read and update endpoints to {@link UserController} handlers.
 * - Enforce authentication on every endpoint via the standard session
 *   middleware pipeline.
 * - Validate the update payload against {@link UpdateProfileSchema}.
 *
 * ### Middleware Pipeline
 * - {@link trustGatewayHeaders} — Extracts identity claims from
 *   gateway-injected headers and attaches them to `req.user`.
 * - {@link sessionMiddleware} — Verifies the active session in Redis and
 *   extends the session TTL.
 * - {@link validateSchema} — Zod-validates the request body before delegating
 *   to the controller.
 * - {@link asyncHandler} — Routes async controller exceptions to the global
 *   error handler.
 */
const router: Router = Router();

// Get profile of the authenticated user
router.get(
  "/me",
  trustGatewayHeaders,
  sessionMiddleware,
  asyncHandler((req, res) => userController.getProfile(req, res)),
);

// Update profile of the authenticated user
router.put(
  "/me",
  trustGatewayHeaders,
  sessionMiddleware,
  validateSchema(UpdateProfileSchema),
  asyncHandler((req, res) => userController.updateProfile(req, res)),
);

export default router;
