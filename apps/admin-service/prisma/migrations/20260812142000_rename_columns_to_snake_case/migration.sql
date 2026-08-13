-- AlterTable: Rename camelCase columns to snake_case for all tables to match schema.prisma mappings

-- admins
ALTER TABLE "admins" RENAME COLUMN "passwordHash" TO "password_hash";
ALTER TABLE "admins" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "admins" RENAME COLUMN "updatedAt" TO "updated_at";

-- stations
ALTER TABLE "stations" RENAME COLUMN "isActive" TO "is_active";
ALTER TABLE "stations" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "stations" RENAME COLUMN "updatedAt" TO "updated_at";

-- trains
ALTER TABLE "trains" RENAME COLUMN "trainNumber" TO "train_number";
ALTER TABLE "trains" RENAME COLUMN "trainName" TO "train_name";
ALTER TABLE "trains" RENAME COLUMN "isActive" TO "is_active";
ALTER TABLE "trains" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "trains" RENAME COLUMN "updatedAt" TO "updated_at";

-- routes
ALTER TABLE "routes" RENAME COLUMN "trainId" TO "train_id";
ALTER TABLE "routes" RENAME COLUMN "isActive" TO "is_active";
ALTER TABLE "routes" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "routes" RENAME COLUMN "updatedAt" TO "updated_at";

-- route_stations
ALTER TABLE "route_stations" RENAME COLUMN "routeId" TO "route_id";
ALTER TABLE "route_stations" RENAME COLUMN "stationId" TO "station_id";
ALTER TABLE "route_stations" RENAME COLUMN "stopNumber" TO "stop_number";
ALTER TABLE "route_stations" RENAME COLUMN "arrivalMinutes" TO "arrival_minutes";
ALTER TABLE "route_stations" RENAME COLUMN "departureMinutes" TO "departure_minutes";
ALTER TABLE "route_stations" RENAME COLUMN "distanceFromStart" TO "distance_from_start";
ALTER TABLE "route_stations" RENAME COLUMN "platformNumber" TO "platform_number";
ALTER TABLE "route_stations" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "route_stations" RENAME COLUMN "updatedAt" TO "updated_at";

-- coaches
ALTER TABLE "coaches" RENAME COLUMN "trainId" TO "train_id";
ALTER TABLE "coaches" RENAME COLUMN "coachNumber" TO "coach_number";
ALTER TABLE "coaches" RENAME COLUMN "coachType" TO "coach_type";
ALTER TABLE "coaches" RENAME COLUMN "totalSeats" TO "total_seats";
ALTER TABLE "coaches" RENAME COLUMN "isActive" TO "is_active";
ALTER TABLE "coaches" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "coaches" RENAME COLUMN "updatedAt" TO "updated_at";

-- seats
ALTER TABLE "seats" RENAME COLUMN "coachId" TO "coach_id";
ALTER TABLE "seats" RENAME COLUMN "seatNumber" TO "seat_number";
ALTER TABLE "seats" RENAME COLUMN "seatType" TO "seat_type";
ALTER TABLE "seats" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "seats" RENAME COLUMN "updatedAt" TO "updated_at";

-- operating_days
ALTER TABLE "operating_days" RENAME COLUMN "trainId" TO "train_id";
ALTER TABLE "operating_days" RENAME COLUMN "dayOfWeek" TO "day_of_week";
ALTER TABLE "operating_days" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "operating_days" RENAME COLUMN "updatedAt" TO "updated_at";

-- schedules
ALTER TABLE "schedules" RENAME COLUMN "trainId" TO "train_id";
ALTER TABLE "schedules" RENAME COLUMN "departureDate" TO "departure_date";
ALTER TABLE "schedules" RENAME COLUMN "createdAt" TO "created_at";
ALTER TABLE "schedules" RENAME COLUMN "updatedAt" TO "updated_at";
