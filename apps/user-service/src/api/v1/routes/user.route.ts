import { Router } from "express";
import { trustGatewayHeaders, sessionMiddleware } from "@middleware";
import { validateSchema, asyncHandler } from "@irctc/middleware";
import { userController } from "@container";
import { UserUpdateSchema } from "@dto";

const router: Router = Router();

/**
 * GET /api/v1/users/me
 * Get current logged in user
 */
router.get(
  "/me",
  trustGatewayHeaders,
  sessionMiddleware,
  asyncHandler((req, res) => userController.getProfile(req, res)),
);

/**
 * PUT /api/v1/users/me
 * Update current logged in user's profile
 */
router.put(
  "/me",
  trustGatewayHeaders,
  sessionMiddleware,
  validateSchema(UserUpdateSchema),
  asyncHandler((req, res) => userController.updateProfile(req, res)),
);

export default router;
