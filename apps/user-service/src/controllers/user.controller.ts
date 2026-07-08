import type { UserService } from "@services";
import type { Request, Response } from "express";
import { statusCode, successResponse } from "@irctc/http";
import { UserMapper } from "@mappers";
import { ApiError } from "@irctc/errors";
import { ERROR_CODES } from "@utils/errors";

/**
 * Controller handling user profile and user management HTTP requests.
 */
export class UserController {
  /**
   * Creates an instance of UserController.
   * @param service - The UserService instance.
   */
  constructor(private readonly service: UserService) {}

  /**
   * Retrieves the current user's profile.
   */
  async getProfile(req: Request, res: Response) {
    const userId = req.user!.userId;

    const user = await this.service.getUserById(userId);
    if (!user) {
      throw new ApiError(statusCode.notFound, ERROR_CODES.USER_NOT_FOUND);
    }

    return res
      .status(statusCode.success)
      .json(
        successResponse(
          "Profile retrieved successfully",
          UserMapper.toUserResponseDto(user),
        ),
      );
  }

  /**
   * Updates the authenticated user's profile.
   */
  async updateProfile(req: Request, res: Response) {
    const userId = req.user!.userId;
    const update = req.body;

    const user = await this.service.updateProfile(userId, update);
    if (!user) {
      throw new ApiError(statusCode.notFound, ERROR_CODES.USER_NOT_FOUND);
    }

    return res
      .status(statusCode.success)
      .json(
        successResponse(
          "Profile updated successfully",
          UserMapper.toUserResponseDto(user),
        ),
      );
  }
}
