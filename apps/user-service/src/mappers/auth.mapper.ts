import type { AuthResponseDto } from "@dto";
import type { User } from "@generated/prisma/client.js";

/**
 * Mapper utility class for mapping user entity models and tokens to authentication response DTOs.
 */
export class AuthMapper {
  /**
   * Maps a Prisma User model and its generated JWT tokens to an AuthResponseDto.
   *
   * @param user - The Prisma User model.
   * @param accessToken - The generated access token string.
   * @param refreshToken - The generated refresh token string.
   * @returns The mapped AuthResponseDto object.
   */
  static toAuthResponseDto(
    user: User,
    accessToken: string,
    refreshToken: string,
  ): AuthResponseDto {
    return {
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        createdAt: user.createdAt,
      },
      tokens: {
        accessToken: accessToken,
        refreshToken: refreshToken,
      },
    };
  }
}
