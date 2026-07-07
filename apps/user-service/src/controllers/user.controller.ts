import type { UserService } from "@services";

/**
 * Controller handling user profile and user management HTTP requests.
 */
export class UserController {
  /**
   * Creates an instance of UserController.
   * @param service - The UserService instance.
   */
  constructor(private readonly service: UserService) {}
}
