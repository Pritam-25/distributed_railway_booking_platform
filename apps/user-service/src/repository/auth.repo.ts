import type { Prisma, PrismaClient, User } from "@generated/prisma/client.js";

export class AuthRepository {
  constructor(private readonly prisma: PrismaClient) {}
}
