import { type PrismaClient, type Prisma } from "@generated/prisma/client.js";

/**
 * Repository class handling database operations for the IdempotencyRecord model.
 */
export class IdempotencyRepository {
  /**
   * Creates an instance of IdempotencyRepository.
   *
   * @param prisma - PrismaClient instance.
   */
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Helper method to get the correct prisma database client (either transactional or default client).
   *
   * @param tx - Optional Prisma transaction client.
   * @returns The active transaction client or general prisma client.
   */
  private getClient(tx?: Prisma.TransactionClient) {
    return tx || this.prisma;
  }

  /**
   * Checks if an event key has already been recorded in the idempotency table.
   *
   * @param eventKey - Unique idempotency key.
   * @param tx - Optional Prisma transaction client.
   * @returns True if already processed, false otherwise.
   */
  async exists(
    eventKey: string,
    tx?: Prisma.TransactionClient,
  ): Promise<boolean> {
    const record = await this.getClient(tx).idempotencyRecord.findUnique({
      where: { eventKey },
    });
    return record !== null;
  }

  /**
   * Creates a new idempotency record.
   *
   * @param eventKey - Unique idempotency key.
   * @param tx - Optional Prisma transaction client.
   */
  async create(eventKey: string, tx?: Prisma.TransactionClient): Promise<void> {
    await this.getClient(tx).idempotencyRecord.create({
      data: { eventKey },
    });
  }
}
