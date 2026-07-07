import type { AuthService } from "@services";

export class AuthController {
  constructor(private readonly service: AuthService) {}
}
