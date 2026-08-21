-- CreateEnum
CREATE TYPE "AllocationStatus" AS ENUM ('HELD', 'CONFIRMED', 'CANCELLED', 'EXPIRED');

-- CreateTable
CREATE TABLE "seat_allocations" (
    "id" TEXT NOT NULL,
    "schedule_id" TEXT NOT NULL,
    "seat_inventory_id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "from_station_id" TEXT NOT NULL,
    "to_station_id" TEXT NOT NULL,
    "from_sequence" INTEGER NOT NULL,
    "to_sequence" INTEGER NOT NULL,
    "status" "AllocationStatus" NOT NULL,
    "hold_expires_at" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "seat_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "seat_allocation_history" (
    "id" TEXT NOT NULL,
    "allocation_id" TEXT NOT NULL,
    "old_status" "AllocationStatus" NOT NULL,
    "new_status" "AllocationStatus" NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seat_allocation_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency" (
    "id" TEXT NOT NULL,
    "event_key" TEXT NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "seat_allocations_schedule_id_seat_inventory_id_idx" ON "seat_allocations"("schedule_id", "seat_inventory_id");

-- CreateIndex
CREATE INDEX "seat_allocations_booking_id_idx" ON "seat_allocations"("booking_id");

-- CreateIndex
CREATE INDEX "seat_allocations_status_idx" ON "seat_allocations"("status");

-- CreateIndex
CREATE INDEX "seat_allocations_hold_expires_at_idx" ON "seat_allocations"("hold_expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "seat_allocations_booking_id_seat_inventory_id_key" ON "seat_allocations"("booking_id", "seat_inventory_id");

-- CreateIndex
CREATE INDEX "seat_allocation_history_allocation_id_idx" ON "seat_allocation_history"("allocation_id");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_event_key_key" ON "idempotency"("event_key");

-- CreateIndex
CREATE INDEX "idempotency_event_key_idx" ON "idempotency"("event_key");

-- Enable btree_gist extension for range and scalar mix exclusions
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Prevent overlap of seatInventoryId across active HELD or CONFIRMED segments
ALTER TABLE "seat_allocations" ADD CONSTRAINT "exclude_overlapping_seat_segments"
EXCLUDE USING gist (
  "seat_inventory_id" WITH =,
  int4range("from_sequence", "to_sequence") WITH &&
)
WHERE ("status" IN ('HELD', 'CONFIRMED'));

ALTER TABLE "seat_allocations"
  ADD CONSTRAINT "seat_allocations_valid_segment"
  CHECK ("from_sequence" < "to_sequence");

