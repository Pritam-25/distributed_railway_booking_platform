import type { PrismaClient } from "@generated/prisma/client.js";

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
}
