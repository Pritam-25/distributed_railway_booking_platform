import type { StationRepository } from "@repository";

export class StationService {
  constructor(protected readonly repo: StationRepository) {}
}
