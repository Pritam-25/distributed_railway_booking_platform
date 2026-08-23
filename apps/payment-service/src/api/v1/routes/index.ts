import { Router } from "express";
import healthRoutes from "./health.routes.js";
import paymentRoutes from "./payment.routes.js";

const router: Router = Router();

router.use("/payments", paymentRoutes);

export { router, healthRoutes };
export default router;
