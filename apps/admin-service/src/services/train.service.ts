import type { TrainRepository } from "@repository";

export class TrainService {
  constructor(protected readonly repo: TrainRepository) {}
}
