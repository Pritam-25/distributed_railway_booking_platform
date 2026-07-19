-- This is an empty migration.
-- AlterTable
ALTER TABLE "seats"
  ADD CONSTRAINT "seats_seatNumber_positive_chk" CHECK ("seatNumber" > 0);

ALTER TABLE "route_stations"
  ADD CONSTRAINT "route_stations_stopNumber_positive_chk" CHECK ("stopNumber" > 0),
  ADD CONSTRAINT "route_stations_distance_non_negative_chk" CHECK ("distanceFromStart" >= 0),
  ADD CONSTRAINT "route_stations_arrivalMinutes_non_negative_chk" CHECK ("arrivalMinutes" >= 0),
  ADD CONSTRAINT "route_stations_departureMinutes_non_negative_chk" CHECK ("departureMinutes" >= 0);

ALTER TABLE "schedules"
  ADD CONSTRAINT "schedules_availableSeats_non_negative_chk" CHECK ("availableSeats" >= 0),
  ADD CONSTRAINT "schedules_waitlistCount_non_negative_chk" CHECK ("waitlistCount" >= 0),
  ADD CONSTRAINT "schedules_racCount_non_negative_chk" CHECK ("racCount" >= 0);

ALTER TABLE "coaches"
  ADD CONSTRAINT "coaches_totalSeats_positive_chk" CHECK ("totalSeats" > 0);

ALTER TABLE "train_operating_days"
  ADD CONSTRAINT "train_operating_days_dayOfWeek_range_chk" CHECK ("dayOfWeek" BETWEEN 0 AND 6);
