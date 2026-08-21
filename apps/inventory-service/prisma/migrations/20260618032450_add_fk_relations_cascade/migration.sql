-- AddForeignKey
ALTER TABLE "seat_inventory" ADD CONSTRAINT "seat_inventory_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "schedule_inventory"("scheduleId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "route_stops" ADD CONSTRAINT "route_stops_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "schedule_inventory"("scheduleId") ON DELETE CASCADE ON UPDATE CASCADE;
