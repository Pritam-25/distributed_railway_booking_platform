import { Prisma, type PrismaClient } from "@generated/prisma/client.js";

/**
 * Repository class handling database access and CRUD operations for the Coach model.
 */
export class CoachRepository {
  /**
   * Creates an instance of CoachRepository.
   *
   * @param prisma The Prisma Client instance.
   */
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Retrieves a coach by its unique train ID and coach number (e.g., "A1").
   *
   * @param trainId The unique ID of the train.
   * @param coachNumber The coach identifier number or string.
   * @param tx Optional transaction client context.
   * @returns A promise resolving to the coach record or null if not found.
   */
  async getCoachByNumber(
    trainId: string,
    coachNumber: string,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.coach.findFirst({
      where: {
        trainId,
        coachNumber,
        isActive: true,
      },
    });
  }

  /**
   * Fetches a coach by its unique ID.
   *
   * @param id The unique ID of the coach.
   * @param tx Optional transaction client context.
   * @returns A promise resolving to the coach record or null if not found.
   */
  async getCoachById(id: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.coach.findFirst({
      where: { id, isActive: true },
    });
  }

  /**
   * Creates a new coach record.
   *
   * @param data The coach creation input payload.
   * @param tx Optional transaction client context.
   * @returns A promise resolving to the newly created coach record.
   */
  async create(
    data: Prisma.CoachUncheckedCreateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.coach.create({ data });
  }

  /**
   * Updates an existing coach record.
   *
   * @param id The unique ID of the coach to update.
   * @param data The updated coach payload values.
   * @param tx Optional transaction client context.
   * @returns A promise resolving to the updated coach record.
   */
  async update(
    id: string,
    data: Prisma.CoachUpdateInput,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx ?? this.prisma;
    return client.coach.update({
      where: { id },
      data,
    });
  }

  /**
   * Deletes a coach record.
   *
   * @param id The unique ID of the coach to delete.
   * @param tx Optional transaction client context.
   * @returns A promise resolving to the deleted coach record.
   */
  async delete(id: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    return client.coach.update({
      where: { id },
      data: { isActive: false },
    });
  }

  /**
   * Lists all coaches belonging to a specific train ID.
   *
   * @param trainId The unique ID of the train.
   * @returns A promise resolving to an array of coach records.
   */
  async listCoachesByTrainId(trainId: string) {
    return this.prisma.coach.findMany({
      where: { trainId, isActive: true },
      orderBy: { coachNumber: "asc" },
    });
  }
}
