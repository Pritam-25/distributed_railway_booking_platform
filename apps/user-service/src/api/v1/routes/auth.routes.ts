import { authController } from "@container";
import { RegisterSchema } from "@dto";
import { validateSchema, asyncHandler } from "@irctc/middleware";
import { Router } from "express";

const router: Router = Router();

router.post(
  "/send-otp",
  validateSchema(RegisterSchema),
  asyncHandler((req, res) => authController.sendOtp(req, res)),
);

export default router;
