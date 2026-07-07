import type { UserRepository } from "@repository";

export class UserService {
  constructor(private readonly repo: UserRepository) {}
}
