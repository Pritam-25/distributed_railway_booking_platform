import type { Prisma, PrismaClient, User } from "@generated/prisma/client.js";

export class UserRepository {
  constructor(private readonly prisma: PrismaClient) {}
}
