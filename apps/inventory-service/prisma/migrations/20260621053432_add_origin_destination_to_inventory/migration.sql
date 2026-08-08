-- AlterTable
ALTER TABLE "schedule_inventory" ADD COLUMN     "destinationStationCode" TEXT,
ADD COLUMN     "destinationStationId" TEXT,
ADD COLUMN     "destinationStationName" TEXT,
ADD COLUMN     "originStationCode" TEXT,
ADD COLUMN     "originStationId" TEXT,
ADD COLUMN     "originStationName" TEXT;
