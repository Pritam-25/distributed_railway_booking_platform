/*
  Warnings:

  - You are about to drop the column `destinationStationId` on the `routes` table. All the data in the column will be lost.
  - You are about to drop the column `originStationId` on the `routes` table. All the data in the column will be lost.
  - You are about to alter the column `trainNumber` on the `trains` table. The data in that column could be lost. The data in that column will be cast from `Text` to `Char(5)`.

*/
-- DropForeignKey
ALTER TABLE "routes" DROP CONSTRAINT "routes_destinationStationId_fkey";

-- DropForeignKey
ALTER TABLE "routes" DROP CONSTRAINT "routes_originStationId_fkey";

-- AlterTable
ALTER TABLE "routes" DROP COLUMN "destinationStationId",
DROP COLUMN "originStationId";

-- AlterTable
ALTER TABLE "trains" ALTER COLUMN "trainNumber" SET DATA TYPE CHAR(5);
