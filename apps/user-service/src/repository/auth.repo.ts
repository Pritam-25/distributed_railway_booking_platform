import type { PrismaClient } from "@generated/prisma/client.js";

/**
 * Repository handling authentication database operations.
 */
export class AuthRepository {
  /**
   * Creates an instance of AuthRepository.
   * @param prisma - The PrismaClient instance.
   */
  constructor(private readonly prisma: PrismaClient) {}
}
