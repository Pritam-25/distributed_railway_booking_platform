import type { AuthResponseDto, UserResponseDto } from "@dto";
import type { User } from "@generated/prisma/client.js";

/**
 * ## UserMapper
 *
 * Single-aggregate mapper utility class for converting `User` Prisma
 * models into domain data transfer objects and Redis cache representations.
 */
export class UserMapper {
  /**
   * Maps a Prisma `User` entity to a public {@link UserResponseDto}.
   *
   * @param user - The Prisma `User` database model.
   * @returns The mapped {@link UserResponseDto}.
   */
  static toUserResponseDto(user: User): UserResponseDto {
    return {
      id: user.id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      createdAt: user.createdAt,
    };
  }

  /**
   * Maps a Prisma `User` entity and the generated JWT tokens to an
   * {@link AuthResponseDto}.
   *
   * @param user - The Prisma `User` database model.
   * @param accessToken - Signed JWT access token string.
   * @param refreshToken - Signed JWT refresh token string.
   * @returns The mapped {@link AuthResponseDto}.
   */
  static toAuthResponseDto(
    user: User,
    accessToken: string,
    refreshToken: string,
  ): AuthResponseDto {
    return {
      user: UserMapper.toUserResponseDto(user),
      tokens: {
        accessToken,
        refreshToken,
      },
    };
  }

  /**
   * Maps a Prisma `User` entity to an explicit, sanitized cache
   * representation stored in Redis.
   *
   * @remarks
   * Currently delegates to {@link UserMapper.toUserResponseDto}; isolated
   * so future cache-only fields can diverge from the wire format.
   * @param user - The Prisma `User` database model.
   * @returns Sanitized profile payload suitable for Redis storage.
   */
  static toCache(user: User): UserResponseDto {
    return UserMapper.toUserResponseDto(user);
  }
}
