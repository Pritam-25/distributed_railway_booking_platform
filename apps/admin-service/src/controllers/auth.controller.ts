import type { Request, Response } from "express";
import { statusCode, successResponse } from "@irctc/http";
import type { AdminAuthService } from "@services";
import { env } from "@config";

/**
 * Controller class that handles incoming HTTP requests for Admin authentication.
 */
export class AdminAuthController {
  constructor(private readonly authService: AdminAuthService) {}

  /**
   * Helper to set secure, HttpOnly cookies for the admin token.
   */
  private setCookie(
    res: Response,
    name: string,
    value: string,
    maxAge: number,
  ) {
    res.cookie(name, value, {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge,
      path: "/",
    });
  }

  /**
   * Handler for admin login requests.
   */
  async login(req: Request, res: Response) {
    const payload = req.body;
    const authResponse = await this.authService.login(payload);

    // Set cookie to expire in 7 days (604,800,000 milliseconds)
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    this.setCookie(
      res,
      "admin_access_token",
      authResponse.accessToken,
      sevenDaysMs,
    );

    return res.status(statusCode.success).json(
      successResponse("Admin login successful", {
        admin: authResponse.admin,
      }),
    );
  }

  /**
   * Handler for admin logout requests.
   */
  async logout(_req: Request, res: Response) {
    res.clearCookie("admin_access_token", { path: "/" });
    return res
      .status(statusCode.success)
      .json(successResponse("Logged out successfully from Admin context", {}));
  }
}
