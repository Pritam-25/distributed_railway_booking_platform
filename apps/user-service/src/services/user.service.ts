import type { UserRepository } from "@repository";
import type { UpdateProfileDto, UserResponseDto } from "@dto";
import { UserMapper } from "@mappers";
import { redis } from "@config";
import { logger } from "@irctc/logger";
import { AUTH_DURATIONS, REDIS_KEYS } from "@utils/constants";

/**
 * ## UserService
 *
 * Domain service managing the authenticated user's profile, with a
 * Redis read-through cache layered in front of PostgreSQL.
 *
 * @remarks
 * ### Responsibilities
 * - Reads and updates user profile data via {@link UserRepository}.
 * - Maintains a per-user profile cache in Redis.
 *
 * ### Storage & Persistence
 * - **PostgreSQL**: `User` table via {@link UserRepository}.
 * - **Redis**: `user:profile:<id>` profile cache with TTL.
 */
export class UserService {
  /**
   * Creates an instance of UserService.
   *
   * @param repo - Injected {@link UserRepository} instance.
   */
  constructor(private readonly repo: UserRepository) {}

  /**
   * Retrieves a user by primary key, reading the Redis profile cache first
   * and falling back to PostgreSQL on cache miss.
   *
   * @remarks
   * ### Failure Guarantees
   * - Redis read and write errors are logged non-fatally and degrade gracefully to PostgreSQL.
   * @param id - User UUID.
   * @returns The user profile DTO, or `null` when not found.
   */
  async getUserById(id: string): Promise<UserResponseDto | null> {
    const cacheKey = REDIS_KEYS.userProfile(id);

    // 1. Read-through cache lookup
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (err) {
      logger.warn(
        { module: "user", err, userId: id },
        "Redis profile cache read failed; falling back to PostgreSQL",
      );
    }

    // 2. Cache miss (or Redis error) — load from PostgreSQL
    const user = await this.repo.findById(id);
    if (!user) return null;

    // 3. Populate Redis cache using UserMapper.toCache
    const cachedProfile = UserMapper.toCache(user);
    try {
      await redis.set(
        cacheKey,
        JSON.stringify(cachedProfile),
        "EX",
        AUTH_DURATIONS.PROFILE_CACHE_TTL_SECONDS,
      );
    } catch (err) {
      logger.warn(
        { module: "user", err, userId: id },
        "Redis profile cache write failed",
      );
    }

    return UserMapper.toUserResponseDto(user);
  }

  /**
   * Updates a user's profile and synchronizes the Redis profile cache.
   *
   * @remarks
   * ### Failure Guarantees
   * - Redis profile cache write errors are logged non-fatally; PostgreSQL write is the source of truth.
   * @param id - User UUID to update.
   * @param update - Profile DTO carrying the fields to update.
   * @returns The updated user profile DTO.
   */
  async updateProfile(
    id: string,
    update: UpdateProfileDto,
  ): Promise<UserResponseDto> {
    const updatedUser = await this.repo.updateProfile(id, update);

    // 1. Synchronize Redis profile cache with the freshly updated record
    if (updatedUser) {
      const cachedProfile = UserMapper.toCache(updatedUser);
      try {
        await redis.set(
          REDIS_KEYS.userProfile(id),
          JSON.stringify(cachedProfile),
          "EX",
          AUTH_DURATIONS.PROFILE_CACHE_TTL_SECONDS,
        );
      } catch (err) {
        logger.warn(
          { module: "user", err, userId: id },
          "Redis profile cache update failed",
        );
      }
    }

    return UserMapper.toUserResponseDto(updatedUser);
  }
}
