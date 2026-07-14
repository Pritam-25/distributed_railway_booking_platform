import type { AdminRepository } from "@repository";

export class AdminAuthService {
  constructor(protected readonly repo: AdminRepository) {}
}
