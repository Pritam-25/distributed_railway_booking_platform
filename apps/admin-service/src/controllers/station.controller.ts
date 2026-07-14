import type { StationService } from "@services";

export class StationController {
  constructor(protected readonly service: StationService) {}
}
