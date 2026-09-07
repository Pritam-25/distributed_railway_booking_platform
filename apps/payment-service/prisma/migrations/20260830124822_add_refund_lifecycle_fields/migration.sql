/*
  Warnings:

  - A unique constraint covering the columns `[idempotency_key]` on the table `payment_refunds` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `idempotency_key` to the `payment_refunds` table without a default value. This is not possible if the table is not empty.

*/
-- AlterEnum
ALTER TYPE "RefundStatus" ADD VALUE 'REVERSED';

-- AlterTable
ALTER TABLE "payment_refunds" ADD COLUMN     "idempotency_key" TEXT NOT NULL,
ALTER COLUMN "razorpay_refund_id" DROP NOT NULL,
ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- CreateIndex
CREATE UNIQUE INDEX "payment_refunds_idempotency_key_key" ON "payment_refunds"("idempotency_key");
