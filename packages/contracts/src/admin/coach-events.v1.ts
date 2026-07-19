import { z } from "zod";

export const CoachCreatedEventV1 = z.object({
  eventId: z.uuid(),
  coachId: z.uuid(),
  trainId: z.uuid(),
  coachNumber: z.string(),
  coachType: z.enum([
    "GEN",
    "SL",
    "AC_3E",
    "AC_3A",
    "AC_2A",
    "AC_1A",
    "CC",
    "EC",
  ]),
  totalSeats: z.number().int().positive(),
  createdAt: z.coerce.date(),
});

export type CoachCreatedEventV1Type = z.infer<typeof CoachCreatedEventV1>;
