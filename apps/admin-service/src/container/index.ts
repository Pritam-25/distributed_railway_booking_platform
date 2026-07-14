import { AdminContainer } from "./admin.container.js";

const adminContainer = AdminContainer.getInstance();

export const {
  stationController,
  trainController,
  adminAuthController,
  coachController,
  seatController,
  routeController,
  scheduleController,
} = adminContainer;

export { AdminContainer };
