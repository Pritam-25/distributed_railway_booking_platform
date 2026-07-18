import type { Coach } from "@generated/prisma/client.js";
import {
  SeatTemplateCreatedEventV1,
  type SeatTemplateCreatedEventV1Type,
} from "@irctc/contracts";

/**
 * Maps Seat generation metadata to versioned event payloads.
 */
export class SeatEventMapper {
  static toCreatedEvent(coach: Coach): SeatTemplateCreatedEventV1Type {
    return SeatTemplateCreatedEventV1.parse({
      eventId: crypto.randomUUID(),
      coachId: coach.id,
      trainId: coach.trainId,
      coachType: coach.coachType,
      seatCount: coach.totalSeats,
      createdAt: new Date(),
    });
  }
}
