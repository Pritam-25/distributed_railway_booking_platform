import type { UserResponseDto } from "@dto";
import type { User } from "@generated/prisma/client.js";

/**
 * Mapper utility class for mapping user entity models to data transfer objects.
 */
export class UserMapper {
  /**
   * Maps a Prisma User model to a UserResponseDto.
   *
   * @param user - The Prisma User model.
   * @returns The mapped UserResponseDto object.
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
}
