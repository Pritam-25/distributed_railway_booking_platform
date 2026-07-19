import type { Coach } from "@generated/prisma/client.js";
import {
  CoachCreatedEventV1,
  type CoachCreatedEventV1Type,
} from "@irctc/contracts";

/**
 * Maps Coach database entities to versioned event payloads.
 */
export class CoachEventMapper {
  /**
   * Maps a database coach entity to a CoachCreatedEventV1 payload.
   *
   * @param coach The coach entity to map.
   * @returns The validated CoachCreatedEventV1 event payload.
   */
  static toCreatedEvent(coach: Coach): CoachCreatedEventV1Type {
    return CoachCreatedEventV1.parse({
      eventId: crypto.randomUUID(),
      coachId: coach.id,
      trainId: coach.trainId,
      coachNumber: coach.coachNumber,
      coachType: coach.coachType,
      totalSeats: coach.totalSeats,
      createdAt: coach.createdAt,
    });
  }
}
