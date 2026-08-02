export const EVENT_TYPES = {
  // train domain
  TRAIN_CREATED: "TrainCreatedV1",
  TRAIN_UPDATED: "TrainUpdatedV1",
  TRAIN_DEACTIVATED: "TrainDeactivatedV1",

  // coach domain
  COACH_CREATED: "CoachCreatedV1",
  COACH_UPDATED: "CoachUpdatedV1",
  COACH_DEACTIVATED: "CoachDeactivatedV1",

  // seat domain
  SEAT_TEMPLATE_CREATED: "SeatTemplateCreatedV1",

  // station domain
  STATION_CREATED: "StationCreatedV1",
  STATION_UPDATED: "StationUpdatedV1",
  STATION_DEACTIVATED: "StationDeactivatedV1",

  // route domain
  ROUTE_CREATED: "RouteCreatedV1",
  ROUTE_UPDATED: "RouteUpdatedV1",
  ROUTE_DELETED: "RouteDeletedV1",
  ROUTE_STATION_ADDED: "RouteStationAddedV1",
  ROUTE_STATION_UPDATED: "RouteStationUpdatedV1",
  ROUTE_STATION_REMOVED: "RouteStationRemovedV1",

  // schedule domain
  SCHEDULE_CREATED: "ScheduleCreatedV1",
  SCHEDULE_STATUS_CHANGED: "ScheduleStatusChangedV1",

  // inventory domain
  INVENTORY_SCHEDULE_PROJECTED: "InventoryScheduleProjectedV1",
  INVENTORY_SCHEDULE_STATUS_CHANGED: "InventoryScheduleStatusChangedV1",
} as const;
