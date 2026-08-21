import {
  type Coach,
  type GetSeatMapRequest,
  type GetSeatMapResponse,
  type InventoryServiceImplementation,
  type GetSeatDetailsRequest,
  type GetSeatDetailsResponse,
  type SeatMapSeat,
  type ValidateBookingRequest,
  type ValidateBookingResponse,
} from "@irctc/contracts";
import { ApiError, COMMON_ERROR_CODES } from "@irctc/errors";
import { logger } from "@irctc/logger";
import { prisma } from "@config";
import { statusCode } from "@irctc/http";

/**
 * Clock-skew tolerance (ms) when comparing `client_requested_at` against
 * the schedule's `departure_date`. Two services on different hosts can
 * drift slightly; the booking-side clock may be a second or two ahead
 * of inventory's. A 60s window absorbs that without admitting a booking
 * for a train that has truly left.
 */
const DEPARTED_SKEW_TOLERANCE_MS = 60_000;

/**
 * gRPC Handler implementing InventoryService Implementation for nice-grpc.
 * Throws domain ApiErrors which are automatically translated by server middleware.
 */
export const inventoryHandler: InventoryServiceImplementation = {
  async getSeatDetails(
    request: GetSeatDetailsRequest,
  ): Promise<GetSeatDetailsResponse> {
    const { scheduleId, seatId } = request;

    if (!scheduleId || !seatId) {
      throw new ApiError(
        statusCode.badRequest,
        COMMON_ERROR_CODES.INVALID_INPUT,
        "Both scheduleId and seatId are required.",
      );
    }

    const seat = await prisma.seatInventory.findUnique({
      where: {
        scheduleId_seatId: {
          scheduleId,
          seatId,
        },
      },
    });

    if (!seat) {
      throw new ApiError(
        statusCode.notFound,
        COMMON_ERROR_CODES.NOT_FOUND,
        `Seat inventory record not found for given scheduleId and seatId`,
      );
    }

    return {
      scheduleId: seat.scheduleId,
      seatId: seat.seatId,
      seatInventoryId: seat.id,
      trainId: seat.trainId,
      coachId: seat.coachId,
      coachNumber: seat.coachNumber,
      seatNumber: seat.seatNumber,
      seatType: seat.seatType,
      pricePerKm: seat.pricePerKm.toString(),
      version: seat.version,
    };
  },

  async getSeatMap(request: GetSeatMapRequest): Promise<GetSeatMapResponse> {
    const { scheduleId, fromStationId, toStationId } = request;

    logger.debug(
      { module: "inventory-grpc", scheduleId, fromStationId, toStationId },
      "Received getSeatMap gRPC request",
    );

    if (!scheduleId || !fromStationId || !toStationId) {
      throw new ApiError(
        statusCode.badRequest,
        COMMON_ERROR_CODES.INVALID_INPUT,
        "scheduleId, fromStationId, and toStationId are required.",
      );
    }

    // 1. Schedule must exist and be ACTIVE
    const schedule = await prisma.scheduleInventory.findUnique({
      where: { scheduleId },
      select: { status: true },
    });

    logger.debug(
      {
        module: "inventory-grpc",
        scheduleId,
        found: !!schedule,
        status: schedule?.status,
      },
      "Step 1: scheduleInventory query completed",
    );

    if (!schedule) {
      return { status: "SCHEDULE_NOT_FOUND", coaches: [] };
    }
    if (schedule.status !== "ACTIVE") {
      return { status: "SCHEDULE_INACTIVE", coaches: [] };
    }

    // 2. Resolve (fromStation, toStation) -> sequence numbers & segment distance.
    // Accepts either stationId (UUID) or stationCode (e.g. NDLS, HWH, HW).
    const [fromStop, toStop] = await Promise.all([
      prisma.routeStop.findFirst({
        where: {
          scheduleId,
          OR: [
            { stationId: fromStationId },
            { stationCode: fromStationId.toUpperCase() },
          ],
        },
        select: { sequenceNumber: true, distanceFromStart: true },
      }),
      prisma.routeStop.findFirst({
        where: {
          scheduleId,
          OR: [
            { stationId: toStationId },
            { stationCode: toStationId.toUpperCase() },
          ],
        },
        select: { sequenceNumber: true, distanceFromStart: true },
      }),
    ]);

    logger.debug(
      {
        module: "inventory-grpc",
        scheduleId,
        fromStopSeq: fromStop?.sequenceNumber,
        toStopSeq: toStop?.sequenceNumber,
      },
      "Step 2: routeStop sequence query completed",
    );

    if (!fromStop || !toStop) {
      return { status: "SCHEDULE_INACTIVE", coaches: [] };
    }
    const fromSequence = fromStop.sequenceNumber;
    const toSequence = toStop.sequenceNumber;
    if (fromSequence >= toSequence) {
      return { status: "SCHEDULE_INACTIVE", coaches: [] };
    }

    const segmentDistance = Math.max(
      0,
      (toStop.distanceFromStart ?? 0) - (fromStop.distanceFromStart ?? 0),
    );

    // 3. Pull all seats for the schedule, ordered for stable UI rendering.
    const seats = await prisma.seatInventory.findMany({
      where: { scheduleId },
      orderBy: [{ coachNumber: "asc" }, { seatNumber: "asc" }],
      select: {
        id: true,
        seatId: true,
        coachId: true,
        coachNumber: true,
        seatNumber: true,
        seatType: true,
        pricePerKm: true,
      },
    });

    logger.debug(
      { module: "inventory-grpc", scheduleId, count: seats.length },
      "Step 3: seatInventory query completed",
    );

    // 4. Booked seat ids = CONFIRMED or active HELD allocations whose segment overlaps the
    //    (fromSequence, toSequence) tuple.
    const allocations = await prisma.seatAllocation.findMany({
      where: {
        scheduleId,
        OR: [
          { status: "CONFIRMED" },
          { status: "HELD", holdExpiresAt: { gt: new Date() } },
        ],
        fromSequence: { lt: toSequence },
        toSequence: { gt: fromSequence },
      },
      select: { seatInventoryId: true },
    });
    const bookedIds = new Set(allocations.map((a) => a.seatInventoryId));

    logger.debug(
      { module: "inventory-grpc", scheduleId, confirmedCount: bookedIds.size },
      "Step 4: seatAllocation query completed",
    );

    // 5. Group seats by coach.
    const coachesById = new Map<string, Coach>();
    const coachOrder: string[] = [];

    for (const seat of seats) {
      let coach = coachesById.get(seat.coachId);
      if (!coach) {
        coach = {
          coachId: seat.coachId,
          coachNumber: seat.coachNumber,
          coachType: "SL", // fallback — coachType is not on SeatInventory yet
          totalSeats: 0,
          seats: [],
        };
        coachesById.set(seat.coachId, coach);
        coachOrder.push(seat.coachId);
      }

      const pricePerKm = Number(seat.pricePerKm);
      const calculatedPrice =
        segmentDistance > 0
          ? (segmentDistance * pricePerKm).toFixed(2)
          : pricePerKm.toString();

      const seatDto: SeatMapSeat = {
        seatId: seat.seatId,
        seatNumber: seat.seatNumber,
        seatType: seat.seatType,
        berthType: "SEATER", // fallback until SeatInventory.berthType lands
        price: calculatedPrice,
        isBooked: bookedIds.has(seat.id),
        quota: "GENERAL", // fallback until SeatInventory.quota lands
      };
      coach.seats.push(seatDto);
      coach.totalSeats = coach.seats.length;
    }

    logger.debug(
      { module: "inventory-grpc", scheduleId, coachCount: coachOrder.length },
      "Step 5: getSeatMap payload built successfully",
    );

    return {
      status: "OK",
      coaches: coachOrder.map((id) => coachesById.get(id)!),
    };
  },

  /**
   * Synchronous schedule-level pre-flight for `BookingService.createBooking`.
   *
   * Returns one of:
   *   - "OK"                    : schedule exists, is ACTIVE, departure still future.
   *   - "SCHEDULE_NOT_FOUND"    : no schedule with `scheduleId` exists.
   *   - "SCHEDULE_INACTIVE"     : schedule exists but is CANCELLED.
   *   - "TRAIN_ALREADY_DEPARTED": `departureDate + 60s skew < clientRequestedAt`.
   *
   * Does NOT check per-seat availability — that stays in inventory's
   * authoritative `holdSeats` consumer where it belongs and is naturally
   * serialized through the saga.
   */
  async validateBooking(
    request: ValidateBookingRequest,
  ): Promise<ValidateBookingResponse> {
    const { scheduleId, clientRequestedAt } = request;

    logger.debug(
      { module: "inventory-grpc", scheduleId },
      "Received validateBooking gRPC request",
    );

    const schedule = await prisma.scheduleInventory.findUnique({
      where: { scheduleId },
      select: { status: true, departureDate: true },
    });

    if (!schedule) {
      logger.debug(
        { module: "inventory-grpc", scheduleId },
        "validateBooking → SCHEDULE_NOT_FOUND",
      );
      return { status: "SCHEDULE_NOT_FOUND", departureAt: "" };
    }
    if (schedule.status !== "ACTIVE") {
      logger.debug(
        {
          module: "inventory-grpc",
          scheduleId,
          status: schedule.status,
        },
        "validateBooking → SCHEDULE_INACTIVE",
      );
      return { status: "SCHEDULE_INACTIVE", departureAt: "" };
    }

    const clientNowMs = clientRequestedAt
      ? clientRequestedAt.getTime()
      : Date.now();

    const departureMs = schedule.departureDate.getTime();
    const cutoff = departureMs + DEPARTED_SKEW_TOLERANCE_MS;
    if (clientNowMs >= cutoff) {
      logger.debug(
        {
          module: "inventory-grpc",
          scheduleId,
          clientNowMs,
          departureMs,
          cutoff,
        },
        "validateBooking → TRAIN_ALREADY_DEPARTED",
      );
      return { status: "TRAIN_ALREADY_DEPARTED", departureAt: "" };
    }

    logger.debug(
      { module: "inventory-grpc", scheduleId },
      "validateBooking → OK",
    );
    return {
      status: "OK",
      departureAt: schedule.departureDate.toISOString(),
    };
  },
};
