-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'PUBLISHED', 'FAILED', 'DEAD');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('PENDING', 'SEATS_HELD', 'PAYMENT_PENDING', 'CONFIRMING', 'CONFIRMED', 'CANCELLING', 'CANCELLED', 'EXPIRED', 'FAILED');

-- CreateEnum
CREATE TYPE "PassengerGender" AS ENUM ('MALE', 'FEMALE', 'OTHER');

-- CreateEnum
CREATE TYPE "BookingQuota" AS ENUM ('GENERAL', 'LADIES', 'SENIOR_CITIZEN', 'PERSON_WITH_DISABILITY', 'TATKAL', 'PREMIUM_TATKAL', 'DEFENCE', 'FOREIGN_TOURIST');

-- CreateEnum
CREATE TYPE "IdentityDocumentType" AS ENUM ('AADHAAR', 'PAN', 'PASSPORT', 'VOTER_ID', 'DRIVING_LICENSE', 'STUDENT_ID', 'GOVT_ISSUED_ID');

-- CreateEnum
CREATE TYPE "SagaStep" AS ENUM ('HOLD_SEATS', 'CREATE_PAYMENT', 'CONFIRM_SEATS');

-- CreateEnum
CREATE TYPE "SagaStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'COMPENSATED');

-- CreateTable
CREATE TABLE "bookings" (
    "id" TEXT NOT NULL,
    "pnr" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "schedule_id" TEXT NOT NULL,
    "from_station_id" TEXT NOT NULL,
    "to_station_id" TEXT NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "total_price" DECIMAL(12,2) NOT NULL DEFAULT 0.0,
    "payment_order_id" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "failure_reason" TEXT,
    "lock_expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_seats" (
    "id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "seat_inventory_id" TEXT,
    "seat_id" TEXT NOT NULL,
    "coach_id" TEXT,
    "coach_number" TEXT,
    "seat_number" INTEGER,
    "seat_type" TEXT,
    "berth_type" TEXT,
    "from_sequence" INTEGER,
    "to_sequence" INTEGER,
    "price" DECIMAL(12,2),
    "quota" "BookingQuota",

    CONSTRAINT "booking_seats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_passengers" (
    "id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "booking_seat_id" TEXT,
    "full_name" TEXT NOT NULL,
    "age" INTEGER NOT NULL,
    "gender" "PassengerGender" NOT NULL,
    "berth_preference" TEXT,
    "id_type" "IdentityDocumentType",
    "id_number" TEXT,

    CONSTRAINT "booking_passengers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saga_logs" (
    "id" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "step" "SagaStep" NOT NULL,
    "status" "SagaStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saga_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_idempotency_keys" (
    "id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "booking_id" TEXT NOT NULL,
    "response_body" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" TEXT NOT NULL,
    "aggregate_type" TEXT NOT NULL,
    "aggregate_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "headers" JSONB,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "next_retry_at" TIMESTAMP(3),
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bookings_pnr_key" ON "bookings"("pnr");

-- CreateIndex
CREATE INDEX "bookings_user_id_created_at_idx" ON "bookings"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "bookings_status_idx" ON "bookings"("status");

-- CreateIndex
CREATE INDEX "bookings_payment_order_id_idx" ON "bookings"("payment_order_id");

-- CreateIndex
CREATE INDEX "booking_seats_booking_id_idx" ON "booking_seats"("booking_id");

-- CreateIndex
CREATE INDEX "booking_seats_seat_inventory_id_idx" ON "booking_seats"("seat_inventory_id");

-- CreateIndex
CREATE UNIQUE INDEX "booking_passengers_booking_seat_id_key" ON "booking_passengers"("booking_seat_id");

-- CreateIndex
CREATE INDEX "booking_passengers_booking_id_idx" ON "booking_passengers"("booking_id");

-- CreateIndex
CREATE INDEX "saga_logs_status_idx" ON "saga_logs"("status");

-- CreateIndex
CREATE UNIQUE INDEX "saga_logs_booking_id_step_key" ON "saga_logs"("booking_id", "step");

-- CreateIndex
CREATE UNIQUE INDEX "booking_idempotency_keys_idempotency_key_key" ON "booking_idempotency_keys"("idempotency_key");

-- CreateIndex
CREATE INDEX "outbox_events_status_created_at_idx" ON "outbox_events"("status", "created_at");

-- CreateIndex
CREATE INDEX "outbox_events_status_next_retry_at_idx" ON "outbox_events"("status", "next_retry_at");

-- AddForeignKey
ALTER TABLE "booking_seats" ADD CONSTRAINT "booking_seats_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_passengers" ADD CONSTRAINT "booking_passengers_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_passengers" ADD CONSTRAINT "booking_passengers_booking_seat_id_fkey" FOREIGN KEY ("booking_seat_id") REFERENCES "booking_seats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saga_logs" ADD CONSTRAINT "saga_logs_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
