/*
  Warnings:

  - You are about to drop the column `createdBy` on the `coaches` table. All the data in the column will be lost.
  - You are about to drop the column `updatedBy` on the `coaches` table. All the data in the column will be lost.
  - You are about to drop the column `createdBy` on the `route_stations` table. All the data in the column will be lost.
  - You are about to drop the column `updatedBy` on the `route_stations` table. All the data in the column will be lost.
  - You are about to drop the column `createdBy` on the `routes` table. All the data in the column will be lost.
  - You are about to drop the column `updatedBy` on the `routes` table. All the data in the column will be lost.
  - You are about to drop the column `createdBy` on the `seats` table. All the data in the column will be lost.
  - You are about to drop the column `updatedBy` on the `seats` table. All the data in the column will be lost.
  - You are about to drop the column `createdBy` on the `stations` table. All the data in the column will be lost.
  - You are about to drop the column `updatedBy` on the `stations` table. All the data in the column will be lost.
  - You are about to drop the column `createdBy` on the `train_operating_days` table. All the data in the column will be lost.
  - You are about to drop the column `updatedBy` on the `train_operating_days` table. All the data in the column will be lost.
  - You are about to drop the column `createdBy` on the `trains` table. All the data in the column will be lost.
  - You are about to drop the column `updatedBy` on the `trains` table. All the data in the column will be lost.
  - You are about to drop the `schedules` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "schedules" DROP CONSTRAINT "schedules_trainId_fkey";

-- AlterTable
ALTER TABLE "coaches" DROP COLUMN "createdBy",
DROP COLUMN "updatedBy";

-- AlterTable
ALTER TABLE "route_stations" DROP COLUMN "createdBy",
DROP COLUMN "updatedBy";

-- AlterTable
ALTER TABLE "routes" DROP COLUMN "createdBy",
DROP COLUMN "updatedBy";

-- AlterTable
ALTER TABLE "seats" DROP COLUMN "createdBy",
DROP COLUMN "updatedBy";

-- AlterTable
ALTER TABLE "stations" DROP COLUMN "createdBy",
DROP COLUMN "updatedBy",
ALTER COLUMN "zone" DROP NOT NULL;

-- AlterTable
ALTER TABLE "train_operating_days" DROP COLUMN "createdBy",
DROP COLUMN "updatedBy";

-- AlterTable
ALTER TABLE "trains" DROP COLUMN "createdBy",
DROP COLUMN "updatedBy";

-- DropTable
DROP TABLE "schedules";

-- DropEnum
DROP TYPE "ScheduleStatus";

-- RenameIndex
ALTER INDEX "stations_city_idx" RENAME TO "stations_zone_idx";
