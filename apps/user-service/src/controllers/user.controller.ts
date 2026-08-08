import type { UserService } from "@services";
import type { Request, Response } from "express";
import { statusCode, successResponse } from "@irctc/http";
import { ApiError } from "@irctc/errors";
import { ERROR_CODES } from "@utils/errors";
import type { UpdateProfileDto } from "@dto";

/**
 * ## UserController
 * Thin HTTP adapter for authenticated user profile endpoints.
 *
 * ### Responsibilities
 * - Accepts schema-validated HTTP requests for the currently authenticated user.
 * - Delegates all profile reads and updates to {@link UserService}.
 * - Translates service results into the standard {@link successResponse} envelope
 *
 * ### Error Handling
 * - Does not catch errors; they propagate to the global error handler.
 * - Never throws `ApiError` or any other error type; service layer handles that.
 */
export class UserController {
  /**
   * Creates an instance of UserController.
   *
   * @param service - Injected {@link UserService} instance.
   */
  constructor(private readonly service: UserService) {}

  /**
   * Retrieves the currently authenticated user's profile.
   *
   * `GET /api/v1/users/me`
   *
   * ### Access
   * Authenticated
   *
   * @param req - Express request with user claims attached by auth middleware.
   * @param res - Express response returning the user profile DTO.
   */
  async getProfile(req: Request, res: Response): Promise<void> {
    const userId = req.user!.userId;

    const user = await this.service.getUserById(userId);
    if (!user) {
      throw new ApiError(statusCode.notFound, ERROR_CODES.USER_NOT_FOUND);
    }

    res
      .status(statusCode.success)
      .json(successResponse("Profile retrieved successfully", user));
  }

  /**
   * Updates the currently authenticated user's profile.
   *
   * `PUT /api/v1/users/me`
   *
   * ### Access
   * Authenticated
   *
   * @param req - Express request with validated {@link UpdateProfileDto} body
   *   and user claims attached by auth middleware.
   * @param res - Express response returning the updated user profile DTO.
   */
  async updateProfile(req: Request, res: Response): Promise<void> {
    const userId = req.user!.userId;
    const update: UpdateProfileDto = req.body;

    const user = await this.service.updateProfile(userId, update);
    if (!user) {
      throw new ApiError(statusCode.notFound, ERROR_CODES.USER_NOT_FOUND);
    }

    res
      .status(statusCode.success)
      .json(successResponse("Profile updated successfully", user));
  }
}
