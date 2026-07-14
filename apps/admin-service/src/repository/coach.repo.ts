import type { PrismaClient } from "@generated/prisma/client.js";

export class CoachRepository {
  constructor(protected readonly prisma: PrismaClient) {}
}
