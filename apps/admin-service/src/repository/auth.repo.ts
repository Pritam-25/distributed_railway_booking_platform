import type { PrismaClient } from "@generated/prisma/client.js";

export class AdminRepository {
  constructor(protected readonly prisma: PrismaClient) {}
}
