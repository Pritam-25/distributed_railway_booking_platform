import {
  type Prisma,
  type PrismaClient,
  SagaStep,
  SagaStatus,
} from "@generated/prisma/client.js";

/**
 * Repository class handling database operations for the `SagaLog` aggregate.
 *
 * ### Conventions
 *
 * Every writeable method accepts an optional `Prisma.TransactionClient` so
 * callers can compose multi-write operations inside a single
 * `prisma.$transaction(async (tx) => { ... })` block.
 *
 * ### Concurrency
 *
 * The schema enforces a `@@unique([bookingId, step])` constraint — only one
 * row per (booking, step). `create` may race against itself across pods; the
 * unique constraint converts the loser into a Prisma `P2002` error which the
 * service layer translates into a no-op (the saga step is already recorded).
 */
export class SagaRepository {
  /**
   * Creates an instance of SagaRepository.
   *
   * @param prisma - PrismaClient instance.
   */
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Helper that returns the transactional client when present, or the
   * shared `PrismaClient` otherwise.
   *
   * @param tx - Optional Prisma transaction client.
   */
  private getClient(tx?: Prisma.TransactionClient) {
    return tx || this.prisma;
  }

  /**
   * Inserts a new `SagaLog` row in the requested state.
   *
   * @param data - Saga log create input (bookingId, step, status).
   * @param tx - Optional transaction client.
   * @returns The created `SagaLog` row.
   */
  async create(
    data: Prisma.SagaLogUncheckedCreateInput,
    tx?: Prisma.TransactionClient,
  ) {
    return this.getClient(tx).sagaLog.create({ data });
  }

  /**
   * Updates an existing `SagaLog` row's `status` and optional `error`
   * fields, scoped by `(bookingId, step)`.
   *
   * @param bookingId - The booking UUID.
   * @param step - Saga step to update.
   * @param status - New saga status.
   * @param error - Optional error message.
   * @param tx - Optional transaction client.
   * @returns The updated `SagaLog` row, or `null` when no row matched.
   */
  async update(
    bookingId: string,
    step: SagaStep,
    status: SagaStatus,
    error: string | null,
    tx?: Prisma.TransactionClient,
  ) {
    return this.getClient(tx).sagaLog.update({
      where: { bookingId_step: { bookingId, step } },
      data: { status, error },
    });
  }

  /**
   * Loads a saga log row by booking + step. Returns `null` when no row exists.
   *
   * @param bookingId - The booking UUID.
   * @param step - Saga step.
   * @param tx - Optional transaction client.
   */
  async findByBookingAndStep(
    bookingId: string,
    step: SagaStep,
    tx?: Prisma.TransactionClient,
  ) {
    return this.getClient(tx).sagaLog.findUnique({
      where: { bookingId_step: { bookingId, step } },
    });
  }
}
