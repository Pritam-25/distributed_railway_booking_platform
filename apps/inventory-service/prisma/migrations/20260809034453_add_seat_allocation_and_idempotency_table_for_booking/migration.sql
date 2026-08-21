/*
  Warnings:

  - You are about to drop the column `arrivalMinutes` on the `route_stops` table. All the data in the column will be lost.
  - You are about to drop the column `departureMinutes` on the `route_stops` table. All the data in the column will be lost.
  - You are about to drop the column `destinationStationCode` on the `schedule_inventory` table. All the data in the column will be lost.
  - You are about to drop the column `destinationStationId` on the `schedule_inventory` table. All the data in the column will be lost.
  - You are about to drop the column `destinationStationName` on the `schedule_inventory` table. All the data in the column will be lost.
  - You are about to drop the column `originStationCode` on the `schedule_inventory` table. All the data in the column will be lost.
  - You are about to drop the column `originStationId` on the `schedule_inventory` table. All the data in the column will be lost.
  - You are about to drop the column `originStationName` on the `schedule_inventory` table. All the data in the column will be lost.
  - You are about to drop the column `trainCategory` on the `schedule_inventory` table. All the data in the column will be lost.
  - You are about to drop the column `coachType` on the `seat_inventory` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "route_stops" DROP COLUMN "arrivalMinutes",
DROP COLUMN "departureMinutes";

-- AlterTable
ALTER TABLE "schedule_inventory" DROP COLUMN "destinationStationCode",
DROP COLUMN "destinationStationId",
DROP COLUMN "destinationStationName",
DROP COLUMN "originStationCode",
DROP COLUMN "originStationId",
DROP COLUMN "originStationName",
DROP COLUMN "trainCategory";

-- AlterTable
ALTER TABLE "seat_inventory" DROP COLUMN "coachType";
