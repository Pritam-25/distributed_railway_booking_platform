import type { PrismaClient } from "@generated/prisma/client.js";

export class StationRepository {
  constructor(protected readonly prisma: PrismaClient) {}
}
