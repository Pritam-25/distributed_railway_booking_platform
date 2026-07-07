import type { Prisma, PrismaClient, User } from "@generated/prisma/client.js";

/**
 * Repository handling user-related database queries and persistence.
 */
export class UserRepository {
  /**
   * Creates an instance of UserRepository.
   * @param prisma - The PrismaClient instance.
   */
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Finds a user by email.
   * @param email - User email
   * @returns Matching user or null when not found
   */
  async findUserByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  /**
   * Finds a user by ID.
   * @param id - User ID
   * @returns Matching user or null when not found
   */
  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }

  /**
   * Creates a new user.
   * @param data - Prisma UserCreateInput
   * @returns The created User record
   */
  async createUser(data: Prisma.UserCreateInput): Promise<User> {
    return this.prisma.user.create({
      data,
    });
  }

  /**
   * Updates an existing user record.
   * @param id - User ID to update.
   * @param data - The fields to update.
   * @returns The updated User record.
   */
  async update(id: string, data: Prisma.UserUpdateInput): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data,
    });
  }
}
