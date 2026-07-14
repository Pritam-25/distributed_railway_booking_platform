import type { PrismaClient } from "@generated/prisma/client.js";

export class SeatRepository {
  constructor(protected readonly prisma: PrismaClient) {}
}
