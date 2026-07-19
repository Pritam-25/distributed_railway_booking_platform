import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "@config";
import { statusCode } from "@irctc/http";
import { ApiError } from "@irctc/errors";
import type { AdminAuthRepository } from "@repository";
import type { AdminLoginRequestDto, AdminAuthResponseDto } from "@dto";
import { logger } from "@irctc/logger";
import { ERROR_CODES } from "@utils/errors";

/**
 * Service class for Admin authentication processes.
 */
export class AdminAuthService {
  constructor(private readonly adminRepo: AdminAuthRepository) {}

  /**
   * Authenticates an administrator using email and password.
   *
   * @param data The admin credentials.
   * @returns The authenticated admin context and signed JWT token.
   * @throws {ApiError} If credentials are invalid.
   */
  async login(data: AdminLoginRequestDto): Promise<AdminAuthResponseDto> {
    const admin = await this.adminRepo.findByEmail(data.email);
    if (!admin) {
      logger.warn(
        { module: "admin-auth" },
        "Admin login failed: Email not found",
      );
      throw new ApiError(
        statusCode.unauthorized,
        ERROR_CODES.INVALID_CREDENTIALS,
      );
    }

    const isPasswordValid = await bcrypt.compare(
      data.password,
      admin.passwordHash,
    );
    if (!isPasswordValid) {
      logger.warn(
        { module: "admin-auth" },
        "Admin login failed: Password mismatch",
      );
      throw new ApiError(
        statusCode.unauthorized,
        ERROR_CODES.INVALID_CREDENTIALS,
      );
    }

    // Sign a 7-day admin token
    const accessToken = jwt.sign(
      { sub: admin.id, type: "admin" },
      env.JWT_SECRET,
      { expiresIn: "7d" },
    );

    logger.info(
      { module: "admin-auth", adminId: admin.id },
      "Admin logged in successfully",
    );

    return {
      admin: {
        id: admin.id,
        email: admin.email,
      },
      accessToken,
    };
  }
}
