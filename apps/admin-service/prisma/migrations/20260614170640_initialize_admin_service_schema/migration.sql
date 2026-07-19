-- CreateEnum
CREATE TYPE "TrainCategory" AS ENUM (
    'RAJDHANI',
    'SHATABDI',
    'VANDE_BHARAT',
    'DURONTO',
    'SUPERFAST',
    'PASSENGER',
    'EXPRESS'
);
-- CreateEnum
CREATE TYPE "SeatType" AS ENUM (
    'LOWER',
    'MIDDLE',
    'UPPER',
    'SIDE_LOWER',
    'SIDE_UPPER'
);
-- CreateEnum
CREATE TYPE "ScheduleStatus" AS ENUM ('SCHEDULED', 'CANCELLED', 'COMPLETED');
-- CreateEnum
CREATE TYPE "CoachType" AS ENUM (
    'GEN',
    'SL',
    'AC_3E',
    'AC_3A',
    'AC_2A',
    'AC_1A',
    'CC',
    'EC'
);
-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM (
    'PENDING',
    'PROCESSING',
    'PUBLISHED',
    'FAILED',
    'DEAD'
);
-- CreateTable
CREATE TABLE "stations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "state" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "stations_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "trains" (
    "id" TEXT NOT NULL,
    "trainNumber" TEXT NOT NULL,
    "trainName" TEXT NOT NULL,
    "category" "TrainCategory" NOT NULL DEFAULT 'PASSENGER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "trains_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "seats" (
    "id" TEXT NOT NULL,
    "coachId" TEXT NOT NULL,
    "seatNumber" INTEGER NOT NULL,
    "seatType" "SeatType" NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "seats_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "routes" (
    "id" TEXT NOT NULL,
    "trainId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "routes_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "route_stations" (
    "id" TEXT NOT NULL,
    "routeId" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "stopNumber" INTEGER NOT NULL,
    "arrivalMinutes" INTEGER,
    "departureMinutes" INTEGER,
    "distanceFromStart" INTEGER NOT NULL DEFAULT 0,
    "platformNumber" TEXT,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "route_stations_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "schedules" (
    "id" TEXT NOT NULL,
    "trainId" TEXT NOT NULL,
    "departureDate " TIMESTAMP(3) NOT NULL,
    "status" "ScheduleStatus" NOT NULL DEFAULT 'SCHEDULED',
    "availableSeats" INTEGER NOT NULL DEFAULT 0,
    "waitlistCount" INTEGER NOT NULL DEFAULT 0,
    "racCount" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "schedules_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "coaches" (
    "id" TEXT NOT NULL,
    "trainId" TEXT NOT NULL,
    "coachNumber" TEXT NOT NULL,
    "coachType" "CoachType" NOT NULL,
    "totalSeats" INTEGER NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "coaches_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "train_operating_days" (
    "id" TEXT NOT NULL,
    "trainId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "train_operating_days_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "stations_name_key" ON "stations"("name");
-- CreateIndex
CREATE UNIQUE INDEX "stations_code_key" ON "stations"("code");
-- CreateIndex
CREATE INDEX "stations_name_idx" ON "stations"("name");
-- CreateIndex
CREATE INDEX "stations_code_idx" ON "stations"("code");
-- CreateIndex
CREATE INDEX "stations_city_idx" ON "stations"("zone");
-- CreateIndex
CREATE UNIQUE INDEX "trains_trainNumber_key" ON "trains"("trainNumber");
-- CreateIndex
CREATE INDEX "trains_trainNumber_idx" ON "trains"("trainNumber");
-- CreateIndex
CREATE INDEX "trains_trainName_idx" ON "trains"("trainName");
-- CreateIndex
CREATE INDEX "seats_seatNumber_idx" ON "seats"("seatNumber");
-- CreateIndex
CREATE UNIQUE INDEX "seats_coachId_seatNumber_key" ON "seats"("coachId", "seatNumber");
-- CreateIndex
CREATE INDEX "route_stations_stopNumber_idx" ON "route_stations"("stopNumber");
-- CreateIndex
CREATE UNIQUE INDEX "route_stations_routeId_stationId_stopNumber_key" ON "route_stations"("routeId", "stationId", "stopNumber");
-- CreateIndex
CREATE UNIQUE INDEX "route_stations_routeId_stopNumber_key" ON "route_stations"("routeId", "stopNumber");
-- CreateIndex
CREATE INDEX "schedules_departureDate _idx" ON "schedules"("departureDate ");
-- CreateIndex
CREATE UNIQUE INDEX "schedules_trainId_departureDate _key" ON "schedules"("trainId", "departureDate ");
-- CreateIndex
CREATE UNIQUE INDEX "coaches_trainId_coachNumber_key" ON "coaches"("trainId", "coachNumber");
-- CreateIndex
CREATE UNIQUE INDEX "train_operating_days_trainId_dayOfWeek_key" ON "train_operating_days"("trainId", "dayOfWeek");
-- AddForeignKey
ALTER TABLE "seats"
ADD CONSTRAINT "seats_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "coaches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "routes"
ADD CONSTRAINT "routes_trainId_fkey" FOREIGN KEY ("trainId") REFERENCES "trains"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "route_stations"
ADD CONSTRAINT "route_stations_routeId_fkey" FOREIGN KEY ("routeId") REFERENCES "routes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "route_stations"
ADD CONSTRAINT "route_stations_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "schedules"
ADD CONSTRAINT "schedules_trainId_fkey" FOREIGN KEY ("trainId") REFERENCES "trains"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "coaches"
ADD CONSTRAINT "coaches_trainId_fkey" FOREIGN KEY ("trainId") REFERENCES "trains"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "train_operating_days"
ADD CONSTRAINT "train_operating_days_trainId_fkey" FOREIGN KEY ("trainId") REFERENCES "trains"("id") ON DELETE CASCADE ON UPDATE CASCADE;