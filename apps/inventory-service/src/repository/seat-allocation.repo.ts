import {
  AllocationStatus,
  type Prisma,
  type PrismaClient,
  type SeatAllocation,
} from "@generated/prisma/client.js";

/**
 * Repository class handling database operations for the `SeatAllocation`
 * model. Used by `SeatAllocationService` to write held allocations inside
 * the booking-saga's hold-seats critical section, and by the saga
 * orchestrator / cancel flows to read them back.
 */
export class SeatAllocationRepository {
  /**
   * Creates an instance of SeatAllocationRepository.
   *
   * @param prisma - PrismaClient instance.
   */
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Returns the active prisma client — either the caller's transaction
   * client or the default client. Mirrors the convention used by the
   * other repositories in the service.
   *
   * @param tx - Optional Prisma transaction client.
   * @returns The transactional client when present, otherwise the default.
   */
  private getClient(tx?: Prisma.TransactionClient) {
    return tx ?? this.prisma;
  }

  /**
   * Inserts multiple seat-allocation rows in a single round-trip.
   *
   * @param data - Array of allocation inputs.
   * @param tx - Optional Prisma transaction client.
   */
  async createMany(
    data: Prisma.SeatAllocationCreateManyInput[],
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await this.getClient(tx).seatAllocation.createMany({ data });
  }

  /**
   * Loads every allocation belonging to a booking. Used by the saga
   * orchestrator when resolving hold-expiry / cancellation flows.
   *
   * @param bookingId - Booking UUID.
   * @param tx - Optional Prisma transaction client.
   */
  async findByBookingId(
    bookingId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<SeatAllocation[]> {
    return this.getClient(tx).seatAllocation.findMany({
      where: { bookingId },
    });
  }

  /**
   * Loads the active (`HELD` or `CONFIRMED`) allocations for a booking.
   * Filters out `EXPIRED` and `CANCELLED` rows so cancellation flows see
   * exactly the rows they need to release.
   *
   * @param bookingId - Booking UUID.
   * @param tx - Optional Prisma transaction client.
   */
  async findActiveByBookingId(
    bookingId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<SeatAllocation[]> {
    return this.getClient(tx).seatAllocation.findMany({
      where: {
        bookingId,
        status: {
          in: [AllocationStatus.HELD, AllocationStatus.CONFIRMED],
        },
      },
    });
  }

  /**
   * Checks if any active (HELD or CONFIRMED) allocation overlaps with the specified segment range.
   * Segment overlap occurs when allocation.fromSequence < toSequence AND allocation.toSequence > fromSequence.
   *
   * @param scheduleId - The unique ID of the schedule.
   * @param seatInventoryIds - Array of seat inventory IDs.
   * @param fromSequence - Origin stop sequence number.
   * @param toSequence - Destination stop sequence number.
   * @param tx - Optional Prisma transaction client.
   * @returns True if overlapping allocation exists, false otherwise.
   */
  async hasOverlappingAllocation(
    scheduleId: string,
    seatInventoryIds: string[],
    fromSequence: number,
    toSequence: number,
    tx?: Prisma.TransactionClient,
  ): Promise<boolean> {
    const count = await this.getClient(tx).seatAllocation.count({
      where: {
        scheduleId,
        seatInventoryId: { in: seatInventoryIds },
        fromSequence: { lt: toSequence },
        toSequence: { gt: fromSequence },
        status: { in: [AllocationStatus.HELD, AllocationStatus.CONFIRMED] },
      },
    });
    return count > 0;
  }

  /**
   * Bulk inserts seat allocation history records for audit tracking.
   *
   * @param data - Array of seat allocation history inputs.
   * @param tx - Optional Prisma transaction client.
   */
  async createHistoryMany(
    data: Prisma.SeatAllocationHistoryUncheckedCreateInput[],
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await this.getClient(tx).seatAllocationHistory.createMany({ data });
  }

  /**
   * Updates status of all allocations for a booking that are currently HELD.
   *
   * @param bookingId - Booking UUID.
   * @param status - Target status to set.
   * @param tx - Optional Prisma transaction client.
   * @returns Batch update payload count.
   */
  async updateManyStatusByBooking(
    bookingId: string,
    status: AllocationStatus,
    tx?: Prisma.TransactionClient,
  ): Promise<Prisma.BatchPayload> {
    return this.getClient(tx).seatAllocation.updateMany({
      where: {
        bookingId,
        status: AllocationStatus.HELD,
      },
      data: {
        status,
      },
    });
  }

  /**
   * Updates status of allocations for a booking that match any of the given source statuses.
   *
   * @param bookingId - Booking UUID.
   * @param status - Target status to set.
   * @param statuses - Array of matching source statuses.
   * @param tx - Optional Prisma transaction client.
   * @returns Batch update payload count.
   */
  async updateManyStatusByBookingAndStatuses(
    bookingId: string,
    status: AllocationStatus,
    statuses: AllocationStatus[],
    tx?: Prisma.TransactionClient,
  ): Promise<Prisma.BatchPayload> {
    return this.getClient(tx).seatAllocation.updateMany({
      where: {
        bookingId,
        status: { in: statuses },
      },
      data: {
        status,
      },
    });
  }
}
