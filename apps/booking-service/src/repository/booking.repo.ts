import {
  BookingStatus,
  type Booking,
  type Prisma,
  type PrismaClient,
} from "@generated/prisma/client.js";

/**
 * Repository class handling database operations for the `Booking` aggregate.
 *
 * ### Conventions
 *
 * Every writeable method accepts an optional `Prisma.TransactionClient`
 * so callers can compose multi-write operations inside a single
 * `prisma.$transaction(async (tx) => { ... })` block. When omitted,
 * the repository falls back to the shared `PrismaClient`.
 *
 * CAS transitions on the `status` column use an `updateMany` with a
 * `version: { lt: expectedVersion }` guard so concurrent transition attempts
 * serialise through the database — exactly one writer wins, the rest
 * observe `updated: false` and abort.
 */
export class BookingRepository {
  /**
   * Creates an instance of BookingRepository.
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
   * Loads a booking by its UUID.
   *
   * @param bookingId - The booking UUID.
   * @param tx - Optional transaction client.
   * @returns The booking row, or `null` when no row matches.
   */
  async findById(
    bookingId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Booking | null> {
    return this.getClient(tx).booking.findUnique({
      where: { id: bookingId },
    });
  }

  /**
   * Loads a booking by its UUID together with its seat rows. Used by the
   * saga orchestrator after `SeatsHeldV1` arrives so it can map the
   * inventory-side `seatInventoryId` onto the booking-side `seatId`.
   *
   * @param bookingId - The booking UUID.
   * @param tx - Optional transaction client.
   */
  async findByIdWithSeats(bookingId: string, tx?: Prisma.TransactionClient) {
    return this.getClient(tx).booking.findUnique({
      where: { id: bookingId },
      include: { seats: true },
    });
  }

  /**
   * Loads a booking by its PNR (10-character unique code printed on
   * the ticket).
   *
   * @param pnr - The PNR string.
   * @param tx - Optional transaction client.
   * @returns The booking row, or `null` when no row matches.
   */
  async findByPnr(
    pnr: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Booking | null> {
    return this.getClient(tx).booking.findUnique({
      where: { pnr },
    });
  }

  /**
   * Lists a user's recent bookings, newest-first.
   *
   * @param userId - The owning user's UUID.
   * @param limit - The no.of bookings to return.
   * @param tx - Optional transaction client.
   * @returns Up to `limit` booking rows, ordered by `createdAt` desc.
   */
  async findByUserId(
    userId: string,
    limit: number,
    tx?: Prisma.TransactionClient,
  ): Promise<Booking[]> {
    return this.getClient(tx).booking.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
    });
  }

  /**
   * Creates a new booking row in the `PENDING` state.
   *
   * @param data - The unchecked create input.
   * @param tx - Optional transaction client.
   * @returns The newly inserted booking row.
   */
  async create(
    data: Prisma.BookingUncheckedCreateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<Booking> {
    return this.getClient(tx).booking.create({
      data,
    });
  }

  /**
   * Atomic CAS transition: updates `status` and bumps `version` iff
   * the row's current version is strictly less than `expectedVersion`.
   *
   * @param bookingId - The booking UUID.
   * @param newStatus - The new status value.
   * @param expectedVersion - The version the writer observed before
   *   issuing the update; the write is rejected if the stored version
   *   has already reached or exceeded this number.
   * @param tx - Optional transaction client.
   * @returns `true` when the row was updated, `false` on a stale write.
   */
  async updateStatus(
    bookingId: string,
    newStatus: BookingStatus,
    expectedVersion: number,
    tx?: Prisma.TransactionClient,
  ): Promise<boolean> {
    const result = await this.getClient(tx).booking.updateMany({
      where: {
        id: bookingId,
        version: { lt: expectedVersion },
      },
      data: {
        status: newStatus,
        version: expectedVersion,
      },
    });
    return result.count > 0;
  }

  /**
   * Updates fields on a booking row.
   *
   * @param bookingId - The booking UUID.
   * @param data - The Prisma update input object.
   * @param tx - Optional transaction client.
   * @returns The updated booking row.
   */
  async update(
    bookingId: string,
    data: Prisma.BookingUpdateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<Booking> {
    return this.getClient(tx).booking.update({
      where: { id: bookingId },
      data,
    });
  }

  /**
   * Persists seat assignments for a booking.
   *
   * @param seats - Array of seat mapping records.
   * @param tx - Optional transaction client.
   */
  async createSeats(
    seats: Prisma.BookingSeatCreateManyInput[],
    tx?: Prisma.TransactionClient,
  ): Promise<Prisma.BatchPayload> {
    return this.getClient(tx).bookingSeat.createMany({
      data: seats,
    });
  }

  /**
   * Persists passenger details for a booking.
   *
   * @param passengers - Array of passenger records.
   * @param tx - Optional transaction client.
   */
  async createPassengers(
    passengers: Prisma.BookingPassengerCreateManyInput[],
    tx?: Prisma.TransactionClient,
  ): Promise<Prisma.BatchPayload> {
    return this.getClient(tx).bookingPassenger.createMany({
      data: passengers,
    });
  }

  /**
   * Maps inventory-side allocation rows onto the booking-side seat rows
   * written during `createBooking`, and persists the enriched metadata.
   *
   * Called by `BookingSagaOrchestrator.handleSeatsHeld` after the
   * inventory reply carries the canonical `coachNumber`, `seatNumber`,
   * `seatType`, `seatInventoryId`, and price for each allocation. The
   * join key is the booking-side `seatId`, which the orchestrator keys
   * from the `HoldSeatsRequestedV1` payload (the booking service picked
   * a `seatId` per passenger when it created the booking).
   *
   * @param bookingId - The booking UUID.
   * @param updates - One update per booking-side seat row, keyed by `seatId`.
   * @param tx - Optional transaction client.
   */
  async updatePassengers(
    bookingId: string,
    updates: ReadonlyArray<{
      seatId: string;
      seatInventoryId: string;
      coachNumber: string;
      seatNumber: number;
      seatType: string;
      price: number;
    }>,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = this.getClient(tx);
    await Promise.all(
      updates.map((u) =>
        client.bookingSeat.updateMany({
          where: { bookingId, seatId: u.seatId },
          data: {
            seatInventoryId: u.seatInventoryId,
            coachNumber: u.coachNumber,
            seatNumber: u.seatNumber,
            seatType: u.seatType,
            price: u.price,
          },
        }),
      ),
    );
  }

  /**
   * Finds an idempotency key mapping by string key.
   *
   * @param idempotencyKey - Unique idempotency key.
   * @param tx - Optional transaction client.
   */
  async findIdempotencyKey(
    idempotencyKey: string,
    tx?: Prisma.TransactionClient,
  ) {
    return this.getClient(tx).bookingIdempotencyKey.findUnique({
      where: { idempotencyKey },
    });
  }

  /**
   * Records an idempotency key mapping and its cached response body.
   *
   * @param data - Idempotency key create input.
   * @param tx - Optional transaction client.
   */
  async createIdempotencyKey(
    data: Prisma.BookingIdempotencyKeyCreateInput,
    tx?: Prisma.TransactionClient,
  ) {
    return this.getClient(tx).bookingIdempotencyKey.create({
      data,
    });
  }
}
