import type { AdminAuthService } from "@services";

export class AdminAuthController {
  constructor(protected readonly service: AdminAuthService) {}
}
