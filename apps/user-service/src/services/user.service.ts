import type { UserRepository } from "@repository";

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
   * Retrieves a user by their email address.
   * @param email - The email address of the user.
   * @returns The user object if found, or null otherwise.
   */
  async getUserByEmail(email: string) {
    return this.repo.findUserByEmail(email);
  }
}
