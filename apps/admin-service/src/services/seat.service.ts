import type { SeatRepository } from "@repository";

export class SeatService {
  constructor(protected readonly repo: SeatRepository) {}
}
