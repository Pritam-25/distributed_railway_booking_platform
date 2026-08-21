import type { Prisma, PrismaClient, User } from "@generated/prisma/client.js";
import type { UpdateProfileDto } from "@dto";

/**
 * ## UserRepository
 *
 * Data access repository for the `User` Prisma model.
 *
 * @remarks
 * ### Responsibilities
 * - Encapsulates all Prisma access for the `User` table.
 * - Exposes both raw Prisma input helpers and DTO-shaped updaters used by
 *   the service layer.
 *
 * ### Storage & Persistence
 * - **PostgreSQL**: `User` table managed via the service-local Prisma client.
 */
export class UserRepository {
  /**
   * Creates an instance of UserRepository.
   *
   * @param prisma - The PrismaClient instance.
   */
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Finds a user by email address.
   *
   * @remarks
   * ### Responsibilities
   * - Issues a unique-key lookup against the `User.email` index.
   *
   * ### Side Effects
   * - **PostgreSQL**: Reads `User` table.
   * @param email - User email address.
   * @returns Matching user record or `null` when not found.
   */
  async findUserByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  /**
   * Finds a user by primary key.
   *
   * @remarks
   * ### Responsibilities
   * - Issues a unique-key lookup against `User.id`.
   *
   * ### Side Effects
   * - **PostgreSQL**: Reads `User` table.
   * @param id - User UUID.
   * @returns Matching user record or `null` when not found.
   */
  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }

  /**
   * Creates a new user record.
   *
   * @remarks
   * ### Responsibilities
   * - Inserts a fresh `User` row from raw Prisma input.
   *
   * ### Side Effects
   * - **PostgreSQL**: Inserts a row into the `User` table.
   * @param data - Prisma `UserCreateInput` payload.
   * @returns The created `User` record.
   */
  async createUser(data: Prisma.UserCreateInput): Promise<User> {
    return this.prisma.user.create({
      data,
    });
  }

  /**
   * Updates an existing user record from a raw Prisma input.
   *
   * @remarks
   * ### Responsibilities
   * - Issues a partial update against `User` by primary key.
   *
   * ### Side Effects
   * - **PostgreSQL**: Updates columns in the `User` table.
   * @param id - User UUID to update.
   * @param data - Prisma `UserUpdateInput` fields to update.
   * @returns The updated `User` record.
   */
  async update(id: string, data: Prisma.UserUpdateInput): Promise<User> {
    return this.prisma.user.update({
      where: { id },
      data,
    });
  }

  /**
   * Updates a user profile from a {@link UpdateProfileDto} payload.
   *
   * @remarks
   * ### Responsibilities
   * - Dynamically strips `undefined` optional fields to satisfy `exactOptionalPropertyTypes`.
   *
   * ### Side Effects
   * - **PostgreSQL**: Updates columns in the `User` table.
   * @param id - User UUID to update.
   * @param data - Profile DTO fields to update.
   * @returns The updated `User` record.
   */
  async updateProfile(id: string, data: UpdateProfileDto): Promise<User> {
    const updateData = Object.fromEntries(
      Object.entries(data).filter(([, value]) => value !== undefined),
    );

    return this.prisma.user.update({
      where: { id },
      data: updateData,
    });
  }

  /**
   * Deletes a user record by primary key.
   *
   * @remarks
   * ### Responsibilities
   * - Issues a hard delete on the target user row.
   *
   * ### Side Effects
   * - **PostgreSQL**: Removes a row from the `User` table.
   * @param id - User UUID to delete.
   * @returns The deleted `User` record.
   */
  async deleteUser(id: string): Promise<User> {
    return this.prisma.user.delete({
      where: { id },
    });
  }
}
