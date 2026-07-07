import { UserRepository } from "@repository";
import { AuthService, UserService } from "@services";
import { AuthController, UserController } from "@controllers";
import { prisma, getProducerSync } from "@config";
import { logger } from "@irctc/logger";
import { OtpEventPublisher, UserLoggedInEventPublisher } from "@publishers";

/**
 * Dependency injection container for user-service.
 * Wires repositories, services, controllers, and event publishers.
 * Singleton pattern ensures shared state across the service.
 *
 * IMPORTANT: Must be instantiated AFTER initKafka() has completed
 * (server.ts guarantees this via dynamic import of app.js).
 */
export class UserContainer {
  private static instance: UserContainer;

  public readonly authController: AuthController;
  public readonly userController: UserController;

  private constructor() {
    // 1. Repositories
    const userRepository = new UserRepository(prisma);

    // 2. Event Publishers
    const producer = getProducerSync();
    const otpPublisher = new OtpEventPublisher(producer);
    const loginPublisher = new UserLoggedInEventPublisher(producer);

    // 3. Services
    const authService = new AuthService(
      userRepository,
      otpPublisher,
      loginPublisher,
    );
    const userService = new UserService(userRepository);

    // 4. Controllers
    this.authController = new AuthController(authService);
    this.userController = new UserController(userService);

    logger.info(
      { module: "user-container" },
      "UserContainer dependencies wired synchronously",
    );
  }

  static getInstance(): UserContainer {
    if (!UserContainer.instance) {
      UserContainer.instance = new UserContainer();
    }

    return UserContainer.instance;
  }
}
