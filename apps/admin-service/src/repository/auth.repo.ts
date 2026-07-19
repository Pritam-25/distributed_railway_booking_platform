import type { PrismaClient } from "@generated/prisma/client.js";

/**
 * Repository class for authentication-related operations on admin users.
 */
export class AdminAuthRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Retrieves an admin record by email address.
   * @param email - Email address of the admin.
   * @returns The admin record if found, otherwise null.
   */
  async findByEmail(email: string) {
    return this.prisma.admin.findUnique({
      where: { email },
    });
  }

  /**
   * Retrieves an admin record by unique ID.
   * @param id - Unique ID of the admin.
   * @returns The admin record if found, otherwise null.
   */
  async findById(id: string) {
    return this.prisma.admin.findUnique({
      where: { id },
    });
  }
}
