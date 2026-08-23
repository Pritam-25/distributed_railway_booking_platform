import { createHealthRouter } from "@irctc/http";
import { healthDependencies } from "@health";

const healthRoutes = createHealthRouter({
  dependencies: healthDependencies,
});

export default healthRoutes;
