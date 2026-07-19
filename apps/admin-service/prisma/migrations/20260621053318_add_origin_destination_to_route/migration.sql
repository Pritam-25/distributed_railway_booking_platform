-- AlterTable
ALTER TABLE "routes" ADD COLUMN     "destinationStationId" TEXT,
ADD COLUMN     "originStationId" TEXT;

-- AddForeignKey
ALTER TABLE "routes" ADD CONSTRAINT "routes_originStationId_fkey" FOREIGN KEY ("originStationId") REFERENCES "stations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "routes" ADD CONSTRAINT "routes_destinationStationId_fkey" FOREIGN KEY ("destinationStationId") REFERENCES "stations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
