import { authController } from "@container";
import { LoginSchema, RegisterSchema, VerifyOtpRequestSchema } from "@dto";
import { validateSchema, asyncHandler } from "@irctc/middleware";
import { Router } from "express";

const router: Router = Router();

router.post(
  "/send-otp",
  validateSchema(RegisterSchema),
  asyncHandler((req, res) => authController.sendOtp(req, res)),
);

router.post(
  "/verify-otp",
  validateSchema(VerifyOtpRequestSchema),
  asyncHandler((req, res) => authController.verifyOtp(req, res)),
);

router.post(
  "/login",
  validateSchema(LoginSchema),
  asyncHandler((req, res) => authController.login(req, res)),
);

export default router;
