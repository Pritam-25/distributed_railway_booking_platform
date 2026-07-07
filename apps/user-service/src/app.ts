import express from "express";
import type { Request, Response, Application } from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import {
  requestIdMiddleware,
  requestLoggerMiddleware,
  errorHandler,
} from "@irctc/middleware";
import { successResponse, statusCode } from "@irctc/http";
import { env } from "@config";
import router, { healthRoutes } from "@routes";

const app: Application = express();

app.use(
  helmet({
    contentSecurityPolicy: false,
  }),
);

app.use(
  cors({
    origin: env.CORS_ORIGINS,
    credentials: true,
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Request-ID",
      "traceparent",
      "baggage",
    ],
    exposedHeaders: ["X-Request-ID", "X-Trace-ID"],
  }),
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(requestIdMiddleware);
app.use(requestLoggerMiddleware);

app.use("/health", healthRoutes);

app.get("/", (_req: Request, res: Response) => {
  res.status(statusCode.success).json(
    successResponse("Welcome to User Service API", {
      version: "1.0.0",
      endpoints: {
        health: "/health",
        users: "/api/v1/users",
      },
    }),
  );
});

app.use("/api/v1", router);

app.use(errorHandler);

export default app;
