-- CreateEnum
CREATE TYPE "ScheduleInventoryStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "SeatType" AS ENUM ('LOWER', 'MIDDLE', 'UPPER', 'SIDE_LOWER', 'SIDE_UPPER');

-- CreateTable
CREATE TABLE "schedule_inventory" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "trainId" TEXT NOT NULL,
    "trainNumber" TEXT NOT NULL,
    "trainName" TEXT NOT NULL,
    "departureDate" TIMESTAMP(3) NOT NULL,
    "status" "ScheduleInventoryStatus" NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedule_inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seat_inventory" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "trainId" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "coachNumber" TEXT NOT NULL,
    "seatId" TEXT NOT NULL,
    "seatNumber" INTEGER NOT NULL,
    "seatType" "SeatType" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seat_inventory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "route_stops" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "stationCode" TEXT NOT NULL,
    "stationName" TEXT NOT NULL,
    "sequenceNumber" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "route_stops_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "schedule_inventory_scheduleId_key" ON "schedule_inventory"("scheduleId");

-- CreateIndex
CREATE INDEX "schedule_inventory_trainId_idx" ON "schedule_inventory"("trainId");

-- CreateIndex
CREATE INDEX "schedule_inventory_departureDate_idx" ON "schedule_inventory"("departureDate");

-- CreateIndex
CREATE INDEX "seat_inventory_scheduleId_idx" ON "seat_inventory"("scheduleId");

-- CreateIndex
CREATE INDEX "seat_inventory_coachId_idx" ON "seat_inventory"("coachId");

-- CreateIndex
CREATE UNIQUE INDEX "seat_inventory_scheduleId_seatId_key" ON "seat_inventory"("scheduleId", "seatId");

-- CreateIndex
CREATE INDEX "route_stops_scheduleId_sequenceNumber_idx" ON "route_stops"("scheduleId", "sequenceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "route_stops_scheduleId_stationId_key" ON "route_stops"("scheduleId", "stationId");

-- CreateIndex
CREATE UNIQUE INDEX "route_stops_scheduleId_sequenceNumber_key" ON "route_stops"("scheduleId", "sequenceNumber");
