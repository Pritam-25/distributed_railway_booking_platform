import crypto from "node:crypto";
import {
  ScheduleInventoryStatus,
  SeatType,
  type PrismaClient,
} from "@generated/prisma/client.js";
import {
  type ScheduleInventoryRepository,
  type RouteStopRepository,
  type SeatInventoryRepository,
} from "@repository";
import { type OutboxRepository } from "@irctc/kafka";
import {
  TOPICS,
  ScheduleCreatedEventV1,
  ScheduleStatusChangedEventV1,
  EVENT_TYPES,
} from "@irctc/contracts";
import { logger } from "@irctc/logger";
import { ApiError } from "@irctc/errors";
import { statusCode } from "@irctc/http";
import { ERROR_CODES } from "@utils/errors";
import { PricingService } from "@services";

/**
 * Service class implementing business logic for Schedule and Inventory synchronization,
 * projection generation, status updates, and downstream search service notifications.
 */
export class ScheduleService {
  /**
   * Creates an instance of ScheduleService.
   *
   * @param prisma - PrismaClient instance for transaction orchestration.
   * @param scheduleInventoryRepository - Repository for schedule inventory operations.
   * @param routeStopRepository - Repository for route stop operations.
   * @param seatInventoryRepository - Repository for seat inventory operations.
   * @param outboxRepository - Repository for transactional outbox operations.
   */
  constructor(
    private readonly prisma: PrismaClient,
    private readonly scheduleInventoryRepository: ScheduleInventoryRepository,
    private readonly routeStopRepository: RouteStopRepository,
    private readonly seatInventoryRepository: SeatInventoryRepository,
    private readonly outboxRepository: OutboxRepository,
  ) {}

  /**
   * Processes a ScheduleCreatedV1 event, creating local projections.
   * Leverages transactional execution and version checks for idempotency.
   *
   * @param event - Raw Kafka event payload.
   * @returns A promise resolving when processing is complete.
   */
  async processCreated(event: unknown): Promise<void> {
    const parsed = ScheduleCreatedEventV1.parse(event);

    await this.prisma.$transaction(
      async (tx) => {
        const scheduleInventory =
          await this.scheduleInventoryRepository.findByScheduleId(
            parsed.scheduleId,
            tx,
          );

        if (scheduleInventory) {
          if (scheduleInventory.version >= parsed.version) {
            logger.info(
              {
                module: "schedule-service",
                scheduleId: parsed.scheduleId,
                eventId: parsed.eventId,
                existingVersion: scheduleInventory.version,
                eventVersion: parsed.version,
              },
              "ScheduleCreatedEventV1 skipped: version is stale or already processed",
            );
            return;
          }

          // Wipe the stale projection — cascades to SeatInventory and RouteStop via FK
          logger.warn(
            {
              module: "schedule-service",
              scheduleId: parsed.scheduleId,
              existingVersion: scheduleInventory.version,
              eventVersion: parsed.version,
            },
            "Overwriting stale schedule projection version",
          );

          await this.scheduleInventoryRepository.deleteByScheduleId(
            parsed.scheduleId,
            tx,
          );
        }

        // Create main projection
        const status =
          parsed.status === ScheduleInventoryStatus.CANCELLED
            ? ScheduleInventoryStatus.CANCELLED
            : ScheduleInventoryStatus.ACTIVE;

        await this.scheduleInventoryRepository.create(
          {
            scheduleId: parsed.scheduleId,
            trainId: parsed.trainId,
            trainNumber: parsed.trainNumber,
            trainName: parsed.trainName,
            departureDate: parsed.departureDate,
            status,
            version: parsed.version,
          },
          tx,
        );

        // Bulk insert route stops
        const routeStopsData = parsed.stops.map((stop) => ({
          scheduleId: parsed.scheduleId,
          stationId: stop.stationId,
          stationCode: stop.stationCode,
          stationName: stop.stationName,
          sequenceNumber: stop.stopNumber,
          distanceFromStart: stop.distanceFromStart,
        }));
        await this.routeStopRepository.createMany(routeStopsData, tx);

        // Bulk insert seats
        const seatInventoriesData = parsed.coaches.flatMap((coach) =>
          coach.seats.map((seat) => ({
            scheduleId: parsed.scheduleId,
            trainId: parsed.trainId,
            coachId: coach.coachId,
            coachNumber: coach.coachNumber,
            seatId: seat.seatId,
            seatNumber: seat.seatNumber,
            seatType: SeatType[seat.seatType as keyof typeof SeatType],
            pricePerKm: PricingService.calculatePricePerKm(
              parsed.trainCategory,
              coach.coachType,
            ),
          })),
        );
        await this.seatInventoryRepository.createMany(seatInventoriesData, tx);

        // Notify downstream search-service via transactional outbox
        await this.outboxRepository.insert(tx, {
          aggregateType: "ScheduleInventory",
          aggregateId: parsed.scheduleId,
          eventType: EVENT_TYPES.INVENTORY_SCHEDULE_PROJECTED,
          topic: TOPICS.INVENTORY_SCHEDULE_PROJECTED,
          payload: {
            eventId: crypto.randomUUID(),
            scheduleId: parsed.scheduleId,
            version: parsed.version,
            createdAt: new Date().toISOString(),
          },
        });

        logger.info(
          {
            module: "schedule-service",
            scheduleId: parsed.scheduleId,
            version: parsed.version,
          },
          "Successfully processed ScheduleCreatedEventV1 and generated local projection",
        );
      },
      {
        maxWait: 5000,
        timeout: 10000,
      },
    );
  }

  /**
   * Processes ScheduleStatusChangedV1 events.
   * Updates projection status and emits downstream updates.
   *
   * @param event - Raw Kafka event payload.
   * @returns A promise resolving when processing is complete.
   */
  async processStatusChanged(event: unknown): Promise<void> {
    const parsed = ScheduleStatusChangedEventV1.parse(event);

    await this.prisma.$transaction(
      async (tx) => {
        const scheduleInventory =
          await this.scheduleInventoryRepository.findByScheduleId(
            parsed.scheduleId,
            tx,
          );

        if (!scheduleInventory) {
          throw new ApiError(
            statusCode.notFound,
            ERROR_CODES.SCHEDULE_INVENTORY_NOT_FOUND,
          );
        }

        if (scheduleInventory.version >= parsed.version) {
          logger.info(
            {
              module: "schedule-service",
              scheduleId: parsed.scheduleId,
              eventId: parsed.eventId,
              existingVersion: scheduleInventory.version,
              eventVersion: parsed.version,
            },
            "ScheduleStatusChangedEventV1 skipped: version is stale or already processed",
          );
          return;
        }

        const newStatus =
          parsed.status === ScheduleInventoryStatus.CANCELLED
            ? ScheduleInventoryStatus.CANCELLED
            : ScheduleInventoryStatus.ACTIVE;

        const updated = await this.scheduleInventoryRepository.updateStatus(
          parsed.scheduleId,
          newStatus,
          parsed.version,
          tx,
        );

        if (!updated) {
          logger.warn(
            {
              module: "schedule-service",
              scheduleId: parsed.scheduleId,
              eventId: parsed.eventId,
              eventVersion: parsed.version,
            },
            "ScheduleStatusChangedEventV1 skipped: concurrent update already applied a newer version",
          );
          return;
        }

        // Emit downstream event
        await this.outboxRepository.insert(tx, {
          aggregateType: "ScheduleInventory",
          aggregateId: parsed.scheduleId,
          eventType: EVENT_TYPES.INVENTORY_SCHEDULE_STATUS_CHANGED,
          topic: TOPICS.INVENTORY_SCHEDULE_STATUS_CHANGED,
          payload: {
            eventId: crypto.randomUUID(),
            scheduleId: parsed.scheduleId,
            status: newStatus,
            version: parsed.version,
            updatedAt: new Date().toISOString(),
          },
        });

        logger.info(
          {
            module: "schedule-service",
            scheduleId: parsed.scheduleId,
            newStatus,
            version: parsed.version,
          },
          "Successfully processed ScheduleStatusChangedEventV1 and updated status",
        );
      },
      {
        maxWait: 5000,
        timeout: 10000,
      },
    );
  }
}
