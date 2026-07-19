import type { Train } from "@generated/prisma/client.js";
import {
  TrainCreatedEventV1,
  TrainUpdatedEventV1,
  TrainDeactivatedEventV1,
  type TrainCreatedEventV1Type,
  type TrainUpdatedEventV1Type,
  type TrainDeactivatedEventV1Type,
} from "@irctc/contracts";

/**
 * Mapper utility class that transforms database Train entities into versioned Outbox event payloads.
 * Ensures the generated payloads strictly adhere to the contracts defined in `@irctc/contracts`.
 */
export class TrainEventMapper {
  /**
   * Maps a database Train entity to a TrainCreatedEventV1 payload.
   *
   * @param train The Train entity to map.
   * @returns The validated TrainCreatedEventV1 event payload.
   */
  static toCreatedEvent(train: Train): TrainCreatedEventV1Type {
    return TrainCreatedEventV1.parse({
      eventId: crypto.randomUUID(),
      trainId: train.id,
      trainNumber: train.trainNumber,
      trainName: train.trainName,
      category: train.category,
      isActive: train.isActive,
      createdAt: train.createdAt,
    });
  }

  /**
   * Maps a database Train entity to a TrainUpdatedEventV1 payload.
   *
   * @param train The Train entity to map.
   * @returns The validated TrainUpdatedEventV1 event payload.
   */
  static toUpdatedEvent(train: Train): TrainUpdatedEventV1Type {
    return TrainUpdatedEventV1.parse({
      eventId: crypto.randomUUID(),
      trainId: train.id,
      trainNumber: train.trainNumber,
      trainName: train.trainName,
      category: train.category,
      isActive: train.isActive,
      updatedAt: train.updatedAt,
    });
  }

  /**
   * Maps a database Train entity to a TrainDeactivatedEventV1 payload.
   *
   * @param train The Train entity to map.
   * @returns The validated TrainDeactivatedEventV1 event payload.
   */
  static toDeactivatedEvent(train: Train): TrainDeactivatedEventV1Type {
    return TrainDeactivatedEventV1.parse({
      eventId: crypto.randomUUID(),
      trainId: train.id,
      trainNumber: train.trainNumber,
      deactivatedAt: train.updatedAt,
    });
  }
}
