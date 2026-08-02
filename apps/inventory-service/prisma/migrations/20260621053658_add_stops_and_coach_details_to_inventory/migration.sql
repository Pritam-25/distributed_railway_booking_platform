-- AlterTable
ALTER TABLE "route_stops" ADD COLUMN     "arrivalMinutes" INTEGER,
ADD COLUMN     "departureMinutes" INTEGER;

-- AlterTable
ALTER TABLE "seat_inventory" ADD COLUMN     "coachType" TEXT NOT NULL DEFAULT 'SL';
