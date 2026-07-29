import type { logger } from "@irctc/logger";

export interface AuthAdmin {
  adminId: string;
}

export interface AuthUser {
  userId: string;
  email?: string;
  sessionId: string;
}

declare module "express" {
  interface Request {
    user?: AuthUser;
    admin?: AuthAdmin;
    requestId?: string;
    logger?: typeof logger;
  }
}
