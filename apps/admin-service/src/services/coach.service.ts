import type { CoachRepository } from "@repository";

export class CoachService {
  constructor(protected readonly repo: CoachRepository) {}
}
