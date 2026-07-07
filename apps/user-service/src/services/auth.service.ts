import type { AuthRepository } from "@repository";

export class AuthService {
  constructor(private readonly repo: AuthRepository) {}
}
