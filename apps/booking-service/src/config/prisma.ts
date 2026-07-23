import { PrismaClient } from "@generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "@config";

const globalForPrisma = globalThis as {
  prisma?: PrismaClient;
};

/**
 * Creates and configures a PrismaClient instance.
 * Uses a PostgreSQL driver adapter (pg) with a connection pool.
 *
 * @returns An initialized PrismaClient instance.
 */
const createPrismaClient = () => {
  const adapter = new PrismaPg({
    connectionString: env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 120_000,
    connectionTimeoutMillis: 15_000,
    keepAlive: true,
  });

  return new PrismaClient({
    adapter,
    // log: env.NODE_ENV === "development" ? ["query", "warn", "error"] : ["error"],
  });
};

/**
 * Singleton PrismaClient instance exported for application-wide database operations.
 * Reuses the existing client cached on the global scope during development hot-reloads.
 */
export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

/**
 * Gracefully disconnects the Prisma database client.
 * Recommended for use in shutdown hooks to ensure connection pools are clean.
 *
 * @returns A promise that resolves when the client successfully disconnects.
 */
export const disconnectPrisma = async () => {
  await prisma.$disconnect();
};
