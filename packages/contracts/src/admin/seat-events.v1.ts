import { z } from "zod";

export const SeatTemplateCreatedEventV1 = z.object({
  eventId: z.uuid(),
  coachId: z.uuid(),
  trainId: z.uuid(),
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
  seatCount: z.number().int().positive(),
  createdAt: z.coerce.date(),
});

export type SeatTemplateCreatedEventV1Type = z.infer<
  typeof SeatTemplateCreatedEventV1
>;
