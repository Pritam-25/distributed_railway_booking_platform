import { Router } from "express";
import { asyncHandler, validateSchema } from "@irctc/middleware";
import { adminAuthController } from "@container";
import { adminLoginSchema } from "@dto";
import { requireAdmin } from "@middleware";

/**
 * all routes are private (Admin only via Gateway)
 *
 * There is no admin create/signup route,
 * Admin user is seeded at the time of DB setup.
 * Or admin user can only be created by platform-admin (Super Admin)
 */
const router: Router = Router();

/**
 * @route POST /api/v1/admin/auth/login
 * @description Admin Login
 */
router.post(
  "/login",
  validateSchema(adminLoginSchema),
  asyncHandler(async (req, res) => {
    return adminAuthController.login(req, res);
  }),
);

/**
 * @route POST /api/v1/admin/auth/logout
 * @description Admin Logout
 */
router.post(
  "/logout",
  requireAdmin,
  asyncHandler(async (req, res) => {
    return adminAuthController.logout(req, res);
  }),
);

export default router;
