import { Router } from "express";

const routeRouter: Router = Router();
const routeStationRouter: Router = Router();

routeRouter.get("/");
routeStationRouter.get("/");

export { routeRouter, routeStationRouter };
