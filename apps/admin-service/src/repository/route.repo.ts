import type { PrismaClient } from "@generated/prisma/client.js";

export class RouteRepository {
  constructor(protected readonly prisma: PrismaClient) {}
}
