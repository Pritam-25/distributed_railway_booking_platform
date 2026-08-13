-- AlterTable: Rename camelCase columns to snake_case for inventory-service models

-- schedule_inventory
ALTER TABLE "schedule_inventory" RENAME COLUMN "scheduleId" TO "schedule_id";
ALTER TABLE "schedule_inventory" RENAME COLUMN "trainId" TO "train_id";
ALTER TABLE "schedule_inventory" RENAME COLUMN "trainNumber" TO "train_number";
ALTER TABLE "schedule_inventory" RENAME COLUMN "trainName" TO "train_name";
ALTER TABLE "schedule_inventory" RENAME COLUMN "departureDate" TO "departure_date";
ALTER TABLE "schedule_inventory" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "schedule_inventory" RENAME COLUMN "updatedAt" TO "updated_at";

-- seat_inventory
ALTER TABLE "seat_inventory" RENAME COLUMN "scheduleId" TO "schedule_id";
ALTER TABLE "seat_inventory" RENAME COLUMN "trainId" TO "train_id";
ALTER TABLE "seat_inventory" RENAME COLUMN "coachId" TO "coach_id";
ALTER TABLE "seat_inventory" RENAME COLUMN "coachNumber" TO "coach_number";
ALTER TABLE "seat_inventory" RENAME COLUMN "seatId" TO "seat_id";
ALTER TABLE "seat_inventory" RENAME COLUMN "seatNumber" TO "seat_number";
ALTER TABLE "seat_inventory" RENAME COLUMN "seatType" TO "seat_type";
ALTER TABLE "seat_inventory" RENAME COLUMN "pricePerKm" TO "price_per_km";
ALTER TABLE "seat_inventory" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "seat_inventory" RENAME COLUMN "updatedAt" TO "updated_at";

-- route_stops
ALTER TABLE "route_stops" RENAME COLUMN "scheduleId" TO "schedule_id";
ALTER TABLE "route_stops" RENAME COLUMN "stationId" TO "station_id";
ALTER TABLE "route_stops" RENAME COLUMN "stationCode" TO "station_code";
ALTER TABLE "route_stops" RENAME COLUMN "stationName" TO "station_name";
ALTER TABLE "route_stops" RENAME COLUMN "sequenceNumber" TO "sequence_number";
ALTER TABLE "route_stops" RENAME COLUMN "distanceFromStart" TO "distance_from_start";
ALTER TABLE "route_stops" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "route_stops" RENAME COLUMN "updatedAt" TO "updated_at";
