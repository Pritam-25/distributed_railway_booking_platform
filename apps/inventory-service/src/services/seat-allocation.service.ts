import crypto from "node:crypto";
import {
  AllocationStatus,
  ScheduleInventoryStatus,
  type Prisma,
  type PrismaClient,
  type RouteStop,
  type SeatInventory,
} from "@generated/prisma/client.js";
import {
  EVENT_TYPES,
  KAFKA_TOPICS,
  SeatAvailabilityStatus,
  SeatAvailabilityReason,
  ValidateBookingResponse_Status,
  type HoldSeatsRequestedV1Type,
  type SeatAllocationV1Type,
  type SeatsHeldV1Type,
  type SeatsHoldFailedV1Type,
  type SeatHoldFailureReasonType,
  type SeatAvailabilityChangedV1Type,
  calculateSeatFareRupees,
} from "@irctc/contracts";
import { type OutboxRepository } from "@irctc/kafka";
import { logger } from "@irctc/logger";
import { env } from "@config";

export type CoachMapItem = {
  coachId: string;
  coachNumber: string;
  coachType: string;
  totalSeats: number;
  seats: Array<{
    seatId: string;
    seatNumber: number;
    seatType: string;
    berthType: string;
    price: string;
    isBooked: boolean;
    quota: string;
    status: string;
  }>;
};

import {
  type IdempotencyRepository,
  type RouteStopRepository,
  type ScheduleInventoryRepository,
  type SeatAllocationRepository,
  type SeatInventoryRepository,
} from "@repository";
import { deriveDeterministicUuid } from "@utils";
import { type SeatLockService } from "./seat-lock.service.js";

/**
 * Outcome of `SeatAllocationService.holdSeats` — exactly one branch is
 * populated per call. The Kafka consumer maps this to the matching
 * outbox row that the service already wrote.
 */
export type HoldSeatsOutcome =
  | { kind: "held"; payload: SeatsHeldV1Type }
  | { kind: "failed"; payload: SeatsHoldFailedV1Type }
  | { kind: "duplicate" };

export interface SeatLifecycleEventArgs {
  eventId: string;
  bookingId: string;
  scheduleId?: string;
  seatInventoryIds?: string[];
}

export type ConfirmSeatsArgs = SeatLifecycleEventArgs;
export type CancelSeatsArgs = SeatLifecycleEventArgs;

/**
 * Service class implementing the inventory-side seat-hold critical
 * section. Called by `HoldSeatsConsumer` when a `HoldSeatsRequestedV1`
 * event lands on the topic.
 */
export class SeatAllocationService {
  /**
   * @param prisma - PrismaClient instance used ONLY for transaction orchestration ($transaction).
   * @param scheduleInventoryRepository - Schedule existence + status checks.
   * @param routeStopRepository - Sequence-index → distance lookup.
   * @param seatInventoryRepository - Inventory row fetch (for pricing + coach info).
   * @param seatAllocationRepository - Allocation row writes.
   * @param idempotencyRepository - Idempotency record tracking.
   * @param outboxRepository - Transactional outbox writes.
   * @param seatLockService - Per-segment Redis lock primitive.
   */
  constructor(
    private readonly prisma: PrismaClient,
    private readonly scheduleInventoryRepository: ScheduleInventoryRepository,
    private readonly routeStopRepository: RouteStopRepository,
    private readonly seatInventoryRepository: SeatInventoryRepository,
    private readonly seatAllocationRepository: SeatAllocationRepository,
    private readonly idempotencyRepository: IdempotencyRepository,
    private readonly outboxRepository: OutboxRepository,
    private readonly seatLockService: SeatLockService,
  ) {}

  /**
   * Runs the hold-seats critical section for a single event.
   * Refactored into clean helper methods to maintain Cognitive Complexity <= 5.
   *
   * @param event - Validated `HoldSeatsRequestedV1` event payload.
   * @returns The success or failure payload that was written to the outbox.
   */
  async holdSeats(event: HoldSeatsRequestedV1Type): Promise<HoldSeatsOutcome> {
    const { eventId, bookingId, scheduleId, seatInventoryIds } = event;
    const eventKey = `booking:hold:${eventId}`;

    logger.info(
      { module: "seat-allocation-service", eventId, bookingId, scheduleId },
      "Processing holdSeats request",
    );

    // 1. Idempotency Check
    if (await this.idempotencyRepository.exists(eventKey)) {
      return this.buildAlreadyProcessedOutcome(eventKey, bookingId);
    }

    // 2. Schedule validation via repository
    if (!(await this.isScheduleActive(scheduleId))) {
      return this.fail(
        event,
        "SCHEDULE_NOT_FOUND",
        "Schedule not found or not active.",
        [...seatInventoryIds],
      );
    }

    // 3. Resolve segment distance & route stops
    const segment = await this.resolveSegmentStops(event);
    if (!segment) {
      return this.fail(
        event,
        "SEGMENT_CONFLICT",
        `Could not resolve valid segment for scheduleId=${scheduleId} fromSequence=${event.fromSequence} toSequence=${event.toSequence}.`,
        [...seatInventoryIds],
      );
    }

    const { fromStop, toStop, distance } = segment;

    // 4. Redis seat-segment lock arguments
    const lockParams = {
      scheduleId,
      seatInventorySegments: seatInventoryIds.map((id) => ({
        seatInventoryId: id,
        fromSequence: fromStop.sequenceNumber,
        toSequence: toStop.sequenceNumber,
      })),
      lockToken: bookingId,
    };

    const locksAcquired = await this.seatLockService.acquireSeatLocks({
      ...lockParams,
      ttlSeconds: env.SEAT_LOCK_TTL_SEC,
    });

    if (!locksAcquired) {
      return this.fail(
        event,
        "SEAT_ALREADY_HELD",
        "One or more requested seats are already held.",
        [...seatInventoryIds],
      );
    }

    try {
      // 5. Verify seat existence & map creation
      const seatById = await this.fetchSeatMap(scheduleId, seatInventoryIds);
      if (!seatById) {
        return this.fail(
          event,
          "SEAT_NOT_FOUND",
          `Seat inventory rows missing for scheduleId=${scheduleId}.`,
          [...seatInventoryIds],
        );
      }

      // 6. Commit Postgres hold transaction
      return await this.commitHoldTransaction(
        event,
        eventKey,
        fromStop,
        toStop,
        distance,
        seatById,
      );
    } finally {
      // 7. Ensure Redis locks are released
      await this.seatLockService.releaseSeatLocks(lockParams);
    }
  }

  private buildAlreadyProcessedOutcome(
    eventKey: string,
    bookingId: string,
  ): HoldSeatsOutcome {
    logger.info(
      { module: "seat-allocation-service", eventKey, bookingId },
      "Hold event already processed, returning neutral duplicate outcome",
    );
    return { kind: "duplicate" };
  }

  private async isScheduleActive(scheduleId: string): Promise<boolean> {
    const schedule =
      await this.scheduleInventoryRepository.findByScheduleId(scheduleId);
    return Boolean(schedule?.status === ScheduleInventoryStatus.ACTIVE);
  }

  private async resolveSegmentStops(event: HoldSeatsRequestedV1Type): Promise<{
    fromStop: RouteStop;
    toStop: RouteStop;
    distance: number;
  } | null> {
    const MAX_POSTGRES_INT = 2147483647;
    const { scheduleId, fromSequence, toSequence, fromStaionId, toStationId } =
      event;

    let fromStop =
      fromSequence > 0 && fromSequence <= MAX_POSTGRES_INT
        ? await this.routeStopRepository.findByScheduleAndSequence(
            scheduleId,
            fromSequence,
          )
        : null;

    let toStop =
      toSequence > 0 && toSequence <= MAX_POSTGRES_INT
        ? await this.routeStopRepository.findByScheduleAndSequence(
            scheduleId,
            toSequence,
          )
        : null;

    if (!fromStop && fromStaionId) {
      fromStop = await this.routeStopRepository.findByScheduleAndStation(
        scheduleId,
        fromStaionId,
      );
    }

    if (!toStop && toStationId) {
      toStop = await this.routeStopRepository.findByScheduleAndStation(
        scheduleId,
        toStationId,
      );
    }

    if (
      !fromStop ||
      !toStop ||
      fromStop.sequenceNumber >= toStop.sequenceNumber
    ) {
      return null;
    }

    const distance = Math.max(
      0,
      (toStop.distanceFromStart ?? 0) - (fromStop.distanceFromStart ?? 0),
    );

    return { fromStop, toStop, distance };
  }

  private async fetchSeatMap(
    scheduleId: string,
    seatInventoryIds: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<Map<string, SeatInventory> | null> {
    const seats = await this.seatInventoryRepository.findManyByIds(
      scheduleId,
      seatInventoryIds,
      tx,
    );
    if (seats.length !== seatInventoryIds.length) return null;
    return new Map(seats.map((s) => [s.id, s]));
  }

  private async commitHoldTransaction(
    event: HoldSeatsRequestedV1Type,
    eventKey: string,
    fromStop: RouteStop,
    toStop: RouteStop,
    distance: number,
    seatById: Map<string, SeatInventory>,
  ): Promise<HoldSeatsOutcome> {
    const { bookingId, scheduleId, seatInventoryIds } = event;
    const holdExpiresAt = new Date(Date.now() + event.holdTtlMs);
    const sortedSeatInventoryIds = [...seatInventoryIds].sort((a, b) =>
      a.localeCompare(b),
    );
    const effectiveFromSeq = fromStop.sequenceNumber;
    const effectiveToSeq = toStop.sequenceNumber;

    const allocationRows = seatInventoryIds.map((id) => {
      const seat = seatById.get(id)!;
      const effectiveDistance = Math.max(0, distance);
      const price = calculateSeatFareRupees(effectiveDistance, seat.pricePerKm);
      return {
        scheduleId,
        seatInventoryId: id,
        bookingId,
        fromStationId: fromStop.stationId,
        toStationId: toStop.stationId,
        fromSequence: effectiveFromSeq,
        toSequence: effectiveToSeq,
        status: AllocationStatus.HELD,
        holdExpiresAt,
        price,
      };
    });

    const replyEventId = deriveDeterministicUuid(`held:${event.eventId}`);
    const heldPayload: SeatsHeldV1Type = {
      eventId: replyEventId,
      bookingId,
      allocations: allocationRows.map((row) => {
        const seat = seatById.get(row.seatInventoryId)!;
        return {
          seatId: seat.seatId,
          seatInventoryId: row.seatInventoryId,
          coachNumber: seat.coachNumber,
          seatNumber: seat.seatNumber,
          seatType: seat.seatType,
          price: row.price,
        } satisfies SeatAllocationV1Type;
      }),
      holdExpiresAt,
      createdAt: new Date(),
    };

    try {
      await this.prisma.$transaction(async (tx) => {
        if (await this.idempotencyRepository.exists(eventKey, tx)) return;

        await this.seatInventoryRepository.lockSeats(
          sortedSeatInventoryIds,
          tx,
        );

        const now = new Date();
        const hasOverlap =
          await this.seatAllocationRepository.hasOverlappingAllocation(
            scheduleId,
            sortedSeatInventoryIds,
            effectiveFromSeq,
            effectiveToSeq,
            now,
            tx,
          );

        if (hasOverlap) {
          throw new Error("SEGMENT_CONFLICT");
        }

        await this.seatAllocationRepository.createMany(allocationRows, tx);

        const createdAllocations =
          await this.seatAllocationRepository.findByBookingId(bookingId, tx);

        const historyData = createdAllocations
          .filter(
            (a) =>
              a.status === AllocationStatus.HELD &&
              a.fromSequence === effectiveFromSeq &&
              a.toSequence === effectiveToSeq,
          )
          .map((a) => ({
            allocationId: a.id,
            oldStatus: AllocationStatus.HELD,
            newStatus: AllocationStatus.HELD,
            reason: "Seat hold requested",
          }));
        await this.seatAllocationRepository.createHistoryMany(historyData, tx);

        await this.idempotencyRepository.create(eventKey, tx);

        await this.outboxRepository.insert(tx, {
          aggregateType: "SeatAllocation",
          aggregateId: bookingId,
          eventType: EVENT_TYPES.INVENTORY_SEATS_HELD,
          topic: KAFKA_TOPICS.INVENTORY_SEATS_HELD,
          payload: heldPayload,
        });

        for (const alloc of createdAllocations) {
          const seat = seatById.get(alloc.seatInventoryId);
          if (!seat) continue;
          const seatAvailabilityPayload: SeatAvailabilityChangedV1Type = {
            eventId: crypto.randomUUID(),
            scheduleId: alloc.scheduleId,
            seatId: seat.seatId,
            seatInventoryId: seat.id,
            status: SeatAvailabilityStatus.HELD,
            reason: SeatAvailabilityReason.HELD,
            fromSequence: alloc.fromSequence,
            toSequence: alloc.toSequence,
            bookingId: alloc.bookingId,
            version: seat.version + 1,
            timestamp: new Date(),
          };
          await this.outboxRepository.insert(tx, {
            aggregateType: "SeatInventory",
            aggregateId: `${alloc.scheduleId}:${seat.seatId}`,
            eventType: EVENT_TYPES.SEAT_AVAILABILITY_CHANGED,
            topic: KAFKA_TOPICS.SEAT_AVAILABILITY_CHANGED,
            payload: seatAvailabilityPayload,
          });
        }
      });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg === "SEGMENT_CONFLICT") {
        logger.warn(
          { module: "seat-allocation-service", bookingId },
          "Segment overlap conflict detected during database check",
        );
        return this.fail(
          event,
          "SEGMENT_CONFLICT",
          "One or more requested seat segments overlap with an active booking.",
          [...seatInventoryIds],
        );
      }

      logger.error(
        {
          module: "seat-allocation-service",
          scheduleId,
          bookingId,
          err:
            err instanceof Error
              ? { message: err.message, stack: err.stack }
              : err,
        },
        "holdSeats transaction failed",
      );
      return this.fail(
        event,
        "INTERNAL_ERROR",
        "Failed to persist seat allocations.",
        [...seatInventoryIds],
      );
    }

    logger.info(
      {
        module: "seat-allocation-service",
        scheduleId,
        bookingId,
        allocationCount: allocationRows.length,
        holdExpiresAt: holdExpiresAt.toISOString(),
      },
      "Seat hold committed successfully",
    );

    return {
      kind: "held",
      payload: heldPayload,
    };
  }

  /**
   * Confirms held seat allocations for a booking when payment succeeds.
   * Updates status to CONFIRMED and logs history.
   *
   * @param event Confirmation details.
   */
  async confirmSeats(event: ConfirmSeatsArgs): Promise<void> {
    const { eventId, bookingId } = event;
    const eventKey = `booking:confirm:${eventId}`;

    logger.info(
      { module: "seat-allocation-service", eventId, bookingId },
      "Processing confirmSeats request",
    );

    if (await this.idempotencyRepository.exists(eventKey)) {
      logger.info(
        { module: "seat-allocation-service", eventKey },
        "ConfirmSeats event already processed, skipping",
      );
      return;
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        if (await this.idempotencyRepository.exists(eventKey, tx)) return;

        const allocations = await this.seatAllocationRepository.findByBookingId(
          bookingId,
          tx,
        );
        const heldAllocations = allocations.filter(
          (a) => a.status === AllocationStatus.HELD,
        );

        if (heldAllocations.length === 0) {
          logger.warn(
            { module: "seat-allocation-service", bookingId },
            "No HELD allocations found to confirm for this booking",
          );
        } else {
          await this.seatAllocationRepository.updateManyStatusByBooking(
            bookingId,
            AllocationStatus.CONFIRMED,
            tx,
          );

          const historyData = heldAllocations.map((a) => ({
            allocationId: a.id,
            oldStatus: AllocationStatus.HELD,
            newStatus: AllocationStatus.CONFIRMED,
            reason: "Booking payment confirmed",
          }));
          await this.seatAllocationRepository.createHistoryMany(
            historyData,
            tx,
          );

          const seatInventoryIds = heldAllocations.map(
            (a) => a.seatInventoryId,
          );
          const seats = await this.seatInventoryRepository.findManyByIds(
            heldAllocations[0]!.scheduleId,
            seatInventoryIds,
            tx,
          );
          const seatMap = new Map(seats.map((s) => [s.id, s]));

          for (const alloc of heldAllocations) {
            const seat = seatMap.get(alloc.seatInventoryId);
            if (!seat) continue;
            const seatAvailabilityPayload: SeatAvailabilityChangedV1Type = {
              eventId: crypto.randomUUID(),
              scheduleId: alloc.scheduleId,
              seatId: seat.seatId,
              seatInventoryId: seat.id,
              status: SeatAvailabilityStatus.BOOKED,
              reason: SeatAvailabilityReason.BOOKED,
              fromSequence: alloc.fromSequence,
              toSequence: alloc.toSequence,
              bookingId: alloc.bookingId,
              version: seat.version + 1,
              timestamp: new Date(),
            };
            await this.outboxRepository.insert(tx, {
              aggregateType: "SeatInventory",
              aggregateId: `${alloc.scheduleId}:${seat.seatId}`,
              eventType: EVENT_TYPES.SEAT_AVAILABILITY_CHANGED,
              topic: KAFKA_TOPICS.SEAT_AVAILABILITY_CHANGED,
              payload: seatAvailabilityPayload,
            });
          }
        }

        await this.idempotencyRepository.create(eventKey, tx);
      });

      logger.info(
        { module: "seat-allocation-service", bookingId },
        "Booking confirmation processed successfully",
      );
    } catch (error) {
      logger.error(
        { module: "seat-allocation-service", bookingId, error },
        "Error processing booking confirmation",
      );
      throw error;
    }
  }

  /**
   * Releases and cancels seat allocations for a booking.
   * Updates status to CANCELLED and logs history.
   *
   * @param event Cancellation details.
   */
  async cancelSeats(event: CancelSeatsArgs): Promise<void> {
    const { eventId, bookingId } = event;
    const eventKey = `booking:cancel:${eventId}`;

    logger.info(
      { module: "seat-allocation-service", eventId, bookingId },
      "Processing cancelSeats request...",
    );

    if (await this.idempotencyRepository.exists(eventKey)) {
      logger.info(
        { module: "seat-allocation-service", eventKey },
        "CancelSeats event already processed, skipping",
      );
      return;
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        if (await this.idempotencyRepository.exists(eventKey, tx)) return;

        const allocations = await this.seatAllocationRepository.findByBookingId(
          bookingId,
          tx,
        );
        const activeAllocations = allocations.filter(
          (a) =>
            a.status === AllocationStatus.HELD ||
            a.status === AllocationStatus.CONFIRMED,
        );

        if (activeAllocations.length === 0) {
          logger.warn(
            { module: "seat-allocation-service", bookingId },
            "No active allocations found to release for this booking",
          );
        } else {
          await this.seatAllocationRepository.updateManyStatusByBookingAndStatuses(
            bookingId,
            AllocationStatus.CANCELLED,
            [AllocationStatus.HELD, AllocationStatus.CONFIRMED],
            tx,
          );

          const historyData = activeAllocations.map((a) => ({
            allocationId: a.id,
            oldStatus: a.status,
            newStatus: AllocationStatus.CANCELLED,
            reason: "Booking cancelled / payment failed",
          }));
          await this.seatAllocationRepository.createHistoryMany(
            historyData,
            tx,
          );

          const seatInventoryIds = activeAllocations.map(
            (a) => a.seatInventoryId,
          );
          const seats = await this.seatInventoryRepository.findManyByIds(
            activeAllocations[0]!.scheduleId,
            seatInventoryIds,
            tx,
          );
          const seatMap = new Map(seats.map((s) => [s.id, s]));

          for (const alloc of activeAllocations) {
            const seat = seatMap.get(alloc.seatInventoryId);
            if (!seat) continue;
            const seatAvailabilityPayload: SeatAvailabilityChangedV1Type = {
              eventId: crypto.randomUUID(),
              scheduleId: alloc.scheduleId,
              seatId: seat.seatId,
              seatInventoryId: seat.id,
              status: SeatAvailabilityStatus.AVAILABLE,
              reason: SeatAvailabilityReason.RELEASED,
              fromSequence: alloc.fromSequence,
              toSequence: alloc.toSequence,
              bookingId: alloc.bookingId,
              version: seat.version + 1,
              timestamp: new Date(),
            };
            await this.outboxRepository.insert(tx, {
              aggregateType: "SeatInventory",
              aggregateId: `${alloc.scheduleId}:${seat.seatId}`,
              eventType: EVENT_TYPES.SEAT_AVAILABILITY_CHANGED,
              topic: KAFKA_TOPICS.SEAT_AVAILABILITY_CHANGED,
              payload: seatAvailabilityPayload,
            });
          }
        }

        await this.idempotencyRepository.create(eventKey, tx);
      });

      logger.info(
        { module: "seat-allocation-service", bookingId },
        "Booking cancellation processed successfully",
      );
    } catch (error) {
      logger.error(
        { module: "seat-allocation-service", bookingId, error },
        "Error processing booking cancellation",
      );
      throw error;
    }
  }

  /**
   * Writes a `SeatsHoldFailedV1` outbox row inside its own transaction
   * so the booking-side orchestrator sees the failure reply.
   *
   * @param event - The originating hold-seats event (carries `bookingId`).
   * @param reason - Stable failure reason code from {@link SeatHoldFailureReasonType}.
   * @param message - Human-readable detail (no PII).
   * @param failedSeatInventoryIds - Optional list of seats that failed.
   */
  private async fail(
    event: HoldSeatsRequestedV1Type,
    reason: SeatHoldFailureReasonType,
    message: string,
    failedSeatInventoryIds?: string[],
  ): Promise<{ kind: "failed"; payload: SeatsHoldFailedV1Type }> {
    const replyEventId = deriveDeterministicUuid(
      `failed:${event.eventId}:${reason}`,
    );
    const payload: SeatsHoldFailedV1Type = {
      eventId: replyEventId,
      bookingId: event.bookingId,
      reason,
      message,
      failedSeatInventoryIds,
      createdAt: new Date(),
    };

    await this.prisma.$transaction(async (tx) => {
      await this.outboxRepository.insert(tx, {
        aggregateType: "SeatAllocation",
        aggregateId: event.bookingId,
        eventType: EVENT_TYPES.INVENTORY_SEATS_HOLD_FAILED,
        topic: KAFKA_TOPICS.INVENTORY_SEATS_HOLD_FAILED,
        payload,
      });
    });

    logger.warn(
      {
        module: "seat-allocation-service",
        scheduleId: event.scheduleId,
        bookingId: event.bookingId,
        reason,
        failedSeatCount: failedSeatInventoryIds?.length ?? 0,
      },
      "Seat hold failed",
    );

    return { kind: "failed", payload };
  }

  /**
   * Fetches the full seat-map with dynamic seat availability status (AVAILABLE, HELD, BOOKED).
   */
  async getSeatMapData(
    scheduleId: string,
    fromStationId: string,
    toStationId: string,
  ) {
    const schedule =
      await this.scheduleInventoryRepository.findByScheduleId(scheduleId);
    if (!schedule) return { status: "SCHEDULE_NOT_FOUND", coaches: [] };
    if (schedule.status !== ScheduleInventoryStatus.ACTIVE) {
      return { status: "SCHEDULE_INACTIVE", coaches: [] };
    }

    const segment = await this.resolveSeatMapSegmentStops(
      scheduleId,
      fromStationId,
      toStationId,
    );
    if (!segment) return { status: "SCHEDULE_INACTIVE", coaches: [] };

    const seats =
      await this.seatInventoryRepository.getByScheduleOrdered(scheduleId);
    const allocations =
      await this.seatAllocationRepository.findActiveAllocationsBySegment(
        scheduleId,
        segment.fromSequence,
        segment.toSequence,
      );

    logger.info(
      {
        module: "getSeatMapData",
        scheduleId,
        fromStationId,
        toStationId,
        fromSequence: segment.fromSequence,
        toSequence: segment.toSequence,
        allocationsCount: allocations.length,
        allocations,
      },
      "[DEBUG] getSeatMapData segment allocation lookup",
    );

    const allocationStatusMap = new Map<string, AllocationStatus>();
    for (const alloc of allocations) {
      const existing = allocationStatusMap.get(alloc.seatInventoryId);
      if (!existing || alloc.status === AllocationStatus.CONFIRMED) {
        allocationStatusMap.set(alloc.seatInventoryId, alloc.status);
      }
    }

    const { coachesById, coachOrder } = this.buildCoachesMap(
      seats,
      allocationStatusMap,
      segment.segmentDistance,
    );

    this.logNonAvailableSeats(scheduleId, coachesById);

    return {
      status: "OK",
      coaches: coachOrder.map((id) => coachesById.get(id)!),
    };
  }

  /**
   * Helper to resolve sequence numbers and segment distance for a route segment.
   */
  private async resolveSeatMapSegmentStops(
    scheduleId: string,
    fromStationId: string,
    toStationId: string,
  ): Promise<{
    fromSequence: number;
    toSequence: number;
    segmentDistance: number;
  } | null> {
    const stops: RouteStop[] =
      await this.routeStopRepository.findStopsByScheduleAndStations(
        scheduleId,
        [fromStationId, toStationId],
      );

    const fromStop = stops.find(
      (s: RouteStop) =>
        s.stationId === fromStationId ||
        s.stationCode === fromStationId.toUpperCase(),
    );
    const toStop = stops.find(
      (s: RouteStop) =>
        s.stationId === toStationId ||
        s.stationCode === toStationId.toUpperCase(),
    );

    if (!fromStop || !toStop) return null;
    if (fromStop.sequenceNumber >= toStop.sequenceNumber) return null;

    return {
      fromSequence: fromStop.sequenceNumber,
      toSequence: toStop.sequenceNumber,
      segmentDistance: Math.max(
        0,
        (toStop.distanceFromStart ?? 0) - (fromStop.distanceFromStart ?? 0),
      ),
    };
  }

  /**
   * Helper to group seats into coaches and compute prices and allocation status.
   */
  private buildCoachesMap(
    seats: SeatInventory[],
    allocationStatusMap: Map<string, AllocationStatus>,
    segmentDistance: number,
  ) {
    const coachesById = new Map<string, CoachMapItem>();
    const coachOrder: string[] = [];

    for (const seat of seats) {
      let coach = coachesById.get(seat.coachId);
      if (!coach) {
        coach = {
          coachId: seat.coachId,
          coachNumber: seat.coachNumber,
          coachType: seat.coachType,
          totalSeats: 0,
          seats: [],
        };
        coachesById.set(seat.coachId, coach);
        coachOrder.push(seat.coachId);
      }

      const calculatedPrice = calculateSeatFareRupees(
        Math.max(0, segmentDistance),
        seat.pricePerKm,
      );

      const allocStatus = allocationStatusMap.get(seat.id);
      let statusStr = SeatAvailabilityStatus.AVAILABLE;
      if (allocStatus === AllocationStatus.CONFIRMED) {
        statusStr = SeatAvailabilityStatus.BOOKED;
      } else if (allocStatus === AllocationStatus.HELD) {
        statusStr = SeatAvailabilityStatus.HELD;
      }
      const isBooked = statusStr !== SeatAvailabilityStatus.AVAILABLE;

      coach.seats.push({
        seatId: seat.seatId,
        seatNumber: seat.seatNumber,
        seatType: seat.seatType,
        berthType: seat.seatType,
        price: calculatedPrice,
        isBooked,
        quota: seat.quota,
        status: statusStr,
      });
      coach.totalSeats = coach.seats.length;
    }

    return { coachesById, coachOrder };
  }

  /**
   * Helper to log debug information for non-AVAILABLE (HELD / BOOKED) seats.
   */
  private logNonAvailableSeats(
    scheduleId: string,
    coachesById: Map<string, CoachMapItem>,
  ): void {
    const nonAvailableSeats: Array<{
      coachNumber: string;
      seatNumber: number;
      seatId: string;
      status: string;
      isBooked: boolean;
    }> = [];

    for (const coach of coachesById.values()) {
      for (const s of coach.seats) {
        if (s.status !== "AVAILABLE") {
          nonAvailableSeats.push({
            coachNumber: coach.coachNumber,
            seatNumber: s.seatNumber,
            seatId: s.seatId,
            status: s.status,
            isBooked: s.isBooked,
          });
        }
      }
    }

    logger.info(
      {
        module: "getSeatMapData",
        scheduleId,
        nonAvailableCount: nonAvailableSeats.length,
        nonAvailableSeats,
      },
      "Filtered non-AVAILABLE (HELD / BOOKED) seats in getSeatMapData.",
    );
  }

  /**
   * Pre-flight validation for booking requests.
   * Validates schedule existence, status, train departure date, and best-effort seat availability when seatIds are provided.
   */
  async validateBooking(
    scheduleId: string,
    fromStationId: string,
    toStationId: string,
    seatIds: string[],
    clientRequestedAt?: Date,
  ) {
    const schedule =
      await this.scheduleInventoryRepository.findByScheduleId(scheduleId);
    if (!schedule)
      return {
        status: ValidateBookingResponse_Status.SCHEDULE_NOT_FOUND,
        seatInventoryIds: [],
        fromSequence: 0,
        toSequence: 0,
      };
    if (schedule.status !== ScheduleInventoryStatus.ACTIVE) {
      return {
        status: ValidateBookingResponse_Status.SCHEDULE_INACTIVE,
        seatInventoryIds: [],
        fromSequence: 0,
        toSequence: 0,
      };
    }

    const segment = await this.resolveSeatMapSegmentStops(
      scheduleId,
      fromStationId,
      toStationId,
    );
    if (!segment) {
      return {
        status: ValidateBookingResponse_Status.INVALID_ROUTE,
        seatInventoryIds: [],
        fromSequence: 0,
        toSequence: 0,
      };
    }

    const requestedAt = clientRequestedAt ?? new Date();
    const toleranceMs = 60_000;
    if (
      requestedAt.getTime() >
      schedule.departureDate.getTime() + toleranceMs
    ) {
      return {
        status: ValidateBookingResponse_Status.TRAIN_ALREADY_DEPARTED,
        seatInventoryIds: [],
        fromSequence: segment.fromSequence,
        toSequence: segment.toSequence,
      };
    }

    // 1. Check duplicate seat IDs
    if (new Set(seatIds).size !== seatIds.length) {
      return {
        status: ValidateBookingResponse_Status.INVALID_SEAT_IDS,
        seatInventoryIds: [],
        fromSequence: segment.fromSequence,
        toSequence: segment.toSequence,
      };
    }

    // 2. Fetch seat inventory rows to verify existence & schedule belonging
    const seats = await this.seatInventoryRepository.findByScheduleAndSeats(
      scheduleId,
      seatIds,
    );
    if (seats.length !== seatIds.length) {
      return {
        status: ValidateBookingResponse_Status.INVALID_SEAT_IDS,
        seatInventoryIds: [],
        fromSequence: segment.fromSequence,
        toSequence: segment.toSequence,
      };
    }

    // Preserve input seatIds ordering
    const seatMap = new Map(seats.map((s) => [s.seatId, s.id]));
    const seatInventoryIds = seatIds.map((id) => seatMap.get(id)!);

    // 3. Check for active (CONFIRMED or unexpired HELD) overlapping allocations
    const now = new Date();
    const hasOverlap =
      await this.seatAllocationRepository.hasOverlappingAllocation(
        scheduleId,
        seatInventoryIds,
        segment.fromSequence,
        segment.toSequence,
        now,
      );

    if (hasOverlap) {
      return {
        status: ValidateBookingResponse_Status.SEAT_UNAVAILABLE,
        seatInventoryIds: [],
        fromSequence: segment.fromSequence,
        toSequence: segment.toSequence,
      };
    }

    return {
      status: ValidateBookingResponse_Status.OK,
      seatInventoryIds,
      fromSequence: segment.fromSequence,
      toSequence: segment.toSequence,
    };
  }
}
