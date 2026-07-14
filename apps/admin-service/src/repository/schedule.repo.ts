import type { PrismaClient } from "@generated/prisma/client.js";

export class ScheduleRepository {
  constructor(protected readonly prisma: PrismaClient) {}
}
