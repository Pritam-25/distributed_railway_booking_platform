import type { UserService } from "@services";

export class UserController {
  constructor(private readonly service: UserService) {}
}
