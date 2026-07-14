import type { CoachService } from "@services";

export class CoachController {
  constructor(protected readonly service: CoachService) {}
}
