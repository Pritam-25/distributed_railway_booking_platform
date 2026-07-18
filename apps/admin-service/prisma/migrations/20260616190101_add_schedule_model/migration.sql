/*
  Warnings:

  - You are about to drop the `train_operating_days` table. If the table is not empty, all the data it contains will be lost.
  - A unique constraint covering the columns `[routeId,stationId]` on the table `route_stations` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[trainId]` on the table `routes` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "ScheduleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'CANCELLED');

-- DropForeignKey
ALTER TABLE "train_operating_days" DROP CONSTRAINT "train_operating_days_trainId_fkey";

-- DropIndex
DROP INDEX "route_stations_routeId_stationId_stopNumber_key";

-- AlterTable
ALTER TABLE "coaches" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- DropTable
DROP TABLE "train_operating_days";

-- CreateTable
CREATE TABLE "operating_days" (
    "id" TEXT NOT NULL,
    "trainId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "operating_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedules" (
    "id" TEXT NOT NULL,
    "trainId" TEXT NOT NULL,
    "departureDate" TIMESTAMP(3) NOT NULL,
    "status" "ScheduleStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "operating_days_trainId_dayOfWeek_key" ON "operating_days"("trainId", "dayOfWeek");

-- CreateIndex
CREATE INDEX "schedules_departureDate_idx" ON "schedules"("departureDate");

-- CreateIndex
CREATE INDEX "schedules_status_idx" ON "schedules"("status");

-- CreateIndex
CREATE UNIQUE INDEX "schedules_trainId_departureDate_key" ON "schedules"("trainId", "departureDate");

-- CreateIndex
CREATE UNIQUE INDEX "route_stations_routeId_stationId_key" ON "route_stations"("routeId", "stationId");

-- CreateIndex
CREATE UNIQUE INDEX "routes_trainId_key" ON "routes"("trainId");

-- AddForeignKey
ALTER TABLE "operating_days" ADD CONSTRAINT "operating_days_trainId_fkey" FOREIGN KEY ("trainId") REFERENCES "trains"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_trainId_fkey" FOREIGN KEY ("trainId") REFERENCES "trains"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
