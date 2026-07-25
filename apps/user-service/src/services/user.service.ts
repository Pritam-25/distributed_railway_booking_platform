import type { UserRepository } from "@repository";
import type { UserUpdateDto } from "@dto";
import { redis } from "@config";
import { logger } from "@irctc/logger";
import { AUTH_DURATIONS, REDIS_KEYS } from "@utils/constants";

/**
 * Service handling business logic related to Users.
 */
export class UserService {
  /**
   * Creates an instance of UserService.
   * @param repo - The UserRepository instance.
   */
  constructor(private readonly repo: UserRepository) {}

  /**
   * Retrieves a user by their unique identifier.
   * Checks Redis first for sub-millisecond response; falls back to PostgreSQL on cache miss or Redis error.
   * @param id - The unique identifier of the user.
   * @returns The user object if found, or null otherwise.
   */
  async getUserById(id: string) {
    const cacheKey = REDIS_KEYS.userProfile(id);

    // 1. Check Redis cache first
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

    // 2. Cache miss or Redis error -> fetch from PostgreSQL database
    const user = await this.repo.findById(id);
    if (!user) return null;

    // 3. Populate Redis cache
    try {
      await redis.set(
        cacheKey,
        JSON.stringify(user),
        "EX",
        AUTH_DURATIONS.PROFILE_CACHE_TTL_SECONDS,
      );
    } catch (err) {
      logger.warn(
        { module: "user", err, userId: id },
        "Redis profile cache write failed",
      );
    }

    return user;
  }

  /**
   * Updates a user's profile and synchronizes the Redis cache.
   * @param id - The ID of the user to update.
   * @param update - The data to update the user with.
   * @returns The updated user object.
   */
  async updateProfile(id: string, update: UserUpdateDto) {
    const updateData: { firstName?: string; lastName?: string } = {};
    if (update.firstName !== undefined) {
      updateData.firstName = update.firstName;
    }
    if (update.lastName !== undefined) {
      updateData.lastName = update.lastName;
    }
    const updatedUser = await this.repo.update(id, updateData);

    // Synchronize Redis profile cache
    if (updatedUser) {
      try {
        await redis.set(
          REDIS_KEYS.userProfile(id),
          JSON.stringify(updatedUser),
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

    return updatedUser;
  }
}
