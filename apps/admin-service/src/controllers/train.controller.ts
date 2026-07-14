import type { TrainService } from "@services";

export class TrainController {
  constructor(protected readonly service: TrainService) {}
}
