import { Router } from "express";
import { asyncHandler, validateSchema } from "@irctc/middleware";
import { adminAuthController } from "@container";
import { adminLoginSchema } from "@dto";
import { requireAdmin } from "@middleware";

const router: Router = Router();

/**
 * all routes are private (Admin only via Gateway)
 */
router.use(requireAdmin);
router.use(requireAdmin);

/**
 * @route POST /api/v1/admin/auth/login
 * @desc Admin Login
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
 * @desc Admin Logout
 */
router.post(
  "/logout",
  asyncHandler(async (req, res) => {
    return adminAuthController.logout(req, res);
  }),
);

export default router;
