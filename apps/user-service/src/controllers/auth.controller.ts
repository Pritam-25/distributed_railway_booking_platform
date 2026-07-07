import type { AuthService } from "@services";
import type { RegisterRequestDto } from "@dto";
import { env } from "@config";
import { COOKIE_NAMES } from "@utils/constants";
import { statusCode, successResponse } from "@irctc/http";
import type { Response, Request } from "express";

/**
 * Controller handling authentication-related HTTP requests.
 */
export class AuthController {
  /**
   * Creates an instance of AuthController.
   * @param service - The AuthService instance.
   */
  constructor(private readonly service: AuthService) {}

  /**
   * Sets a secure cookie on the HTTP response.
   *
   * @param res - The Express Response object.
   * @param name - The name of the cookie.
   * @param value - The value to store in the cookie.
   * @param maxAge - The expiration time of the cookie in milliseconds.
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
   * HTTP endpoint to request/send an OTP for registration.
   * Sets a session cookie and sends a success response.
   *
   * @param req - The Express Request object containing the registration details.
   * @param res - The Express Response object.
   * @returns A promise that resolves when the response is sent.
   */
  async sendOtp(req: Request, res: Response): Promise<void> {
    const payload = req.body as RegisterRequestDto;
    const sessionId = await this.service.sendOtp(payload);

    this.setCookie(
      res,
      COOKIE_NAMES.OTP_SESSION,
      sessionId,
      env.OTP_TTL * 1000,
    );

    res
      .status(statusCode.success)
      .json(successResponse("OTP sent to your email successfully", {}));
  }
}
