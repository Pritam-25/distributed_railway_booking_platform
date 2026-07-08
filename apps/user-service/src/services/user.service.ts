import type { UserRepository } from "@repository";
import type { UserUpdateDto } from "@dto";

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
   * @param id - The unique identifier of the user.
   * @returns The user object if found, or null otherwise.
   */
  async getUserById(id: string) {
    return this.repo.findById(id);
  }

  /**
   * Updates a user's profile.
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
    return this.repo.update(id, updateData);
  }
}
