import type { RouteRepository } from "@repository";

export class RouteService {
  constructor(protected readonly repo: RouteRepository) {}
}
