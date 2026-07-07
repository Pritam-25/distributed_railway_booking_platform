import type { AuthService } from "@services";
import type {
  LoginRequestDto,
  RegisterRequestDto,
  VerifyOtpRequestDto,
} from "@dto";
import { env } from "@config";
import { COOKIE_MAX_AGE, COOKIE_NAMES } from "@utils/constants";
import { statusCode, successResponse } from "@irctc/http";
import type { Response, Request } from "express";
import { getDeviceFingerprint } from "@utils";
import { ApiError } from "@irctc/errors";
import { ERROR_CODES } from "@utils/errors";

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

  /**
   * HTTP endpoint to verify the registration OTP.
   * If verification is successful, registers the user, sets accessToken/refreshToken cookies,
   * clears the OTP session cookie, and returns the registered user's details.
   *
   * @param req - The Express Request object containing the OTP in the body and OTP session ID in cookies.
   * @param res - The Express Response object.
   * @returns A promise that resolves when the response is sent.
   * @throws {ApiError} - If the OTP session ID is missing or invalid.
   */
  async verifyOtp(req: Request, res: Response): Promise<void> {
    const sessionId = req.cookies[COOKIE_NAMES.OTP_SESSION];
    if (!sessionId) {
      throw new ApiError(
        statusCode.badRequest,
        ERROR_CODES.OTP_SESSION_NOT_FOUND,
      );
    }

    const payload = req.body as VerifyOtpRequestDto;
    const authResponse = await this.service.verifyAndRegister(
      sessionId,
      payload,
    );

    this.setCookie(
      res,
      COOKIE_NAMES.ACCESS_TOKEN,
      authResponse.tokens.accessToken,
      COOKIE_MAX_AGE.ACCESS_TOKEN,
    );
    this.setCookie(
      res,
      COOKIE_NAMES.REFRESH_TOKEN,
      authResponse.tokens.refreshToken,
      COOKIE_MAX_AGE.REFRESH_TOKEN,
    );

    // Clear the OTP session cookie after successful registration
    res.clearCookie(COOKIE_NAMES.OTP_SESSION, { path: "/" });

    res
      .status(statusCode.created)
      .json(successResponse("Registration successful", authResponse.user));
  }

  /**
   * HTTP endpoint to authenticate an existing user.
   * Validates credentials, sets access and refresh token cookies, and returns the user's details.
   *
   * @param req - The Express Request object containing login credentials.
   * @param res - The Express Response object.
   * @returns A promise that resolves when the response is sent.
   */
  async login(req: Request, res: Response): Promise<void> {
    const payload = req.body as LoginRequestDto;
    const fingerprint = getDeviceFingerprint(req);

    const authResponse = await this.service.login(payload, fingerprint);

    this.setCookie(
      res,
      COOKIE_NAMES.ACCESS_TOKEN,
      authResponse.tokens.accessToken,
      COOKIE_MAX_AGE.ACCESS_TOKEN,
    );
    this.setCookie(
      res,
      COOKIE_NAMES.REFRESH_TOKEN,
      authResponse.tokens.refreshToken,
      COOKIE_MAX_AGE.REFRESH_TOKEN,
    );

    res
      .status(statusCode.success)
      .json(successResponse("Login successful", authResponse.user));
  }
}
