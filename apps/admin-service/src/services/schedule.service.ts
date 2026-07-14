import type { ScheduleRepository } from "@repository";

export class ScheduleService {
  constructor(protected readonly repo: ScheduleRepository) {}
}
