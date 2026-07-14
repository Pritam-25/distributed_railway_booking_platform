import type { ScheduleService } from "@services";

export class ScheduleController {
  constructor(protected readonly service: ScheduleService) {}
}
