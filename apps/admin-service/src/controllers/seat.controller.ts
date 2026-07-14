import type { SeatService } from "@services";

export class SeatController {
  constructor(protected readonly service: SeatService) {}
}
