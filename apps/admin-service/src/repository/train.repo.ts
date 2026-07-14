import type { PrismaClient } from "@generated/prisma/client.js";

export class TrainRepository {
  constructor(protected readonly prisma: PrismaClient) {}
}
