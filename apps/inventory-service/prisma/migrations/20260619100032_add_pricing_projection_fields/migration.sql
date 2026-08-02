-- AlterTable
ALTER TABLE "route_stops" ADD COLUMN     "distanceFromStart" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "seat_allocations" ADD COLUMN     "price" DECIMAL(10,2) NOT NULL DEFAULT 0.0;

-- AlterTable
ALTER TABLE "seat_inventory" ADD COLUMN     "pricePerKm" DECIMAL(10,4) NOT NULL DEFAULT 0.0;
