import { CoachType } from "@generated/prisma/enums.js";
import { z } from "zod";

export const COACH_CAPACITY = {
  GEN: [90, 120] as [number, number],
  SL: [72, 80] as [number, number],
  AC_3E: [72, 80] as [number, number],
  AC_3A: [64, 72] as [number, number],
  AC_2A: [46, 54] as [number, number],
  AC_1A: [18, 24] as [number, number],
  CC: [73, 78] as [number, number],
  EC: [52, 56] as [number, number],
} as const;

/**
 * Zod validation utility for coach capacity.
 * @param coachType coach type
 * @param totalSeats total seats in the coach
 * @param ctx Zod refinement context
 */
const validateCoachCapacity = (
  coachType: CoachType | undefined,
  totalSeats: number | undefined,
  ctx: z.RefinementCtx,
) => {
  if (coachType !== undefined && totalSeats !== undefined) {
    const range = COACH_CAPACITY[coachType];
    if (totalSeats < range[0] || totalSeats > range[1]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Capacity for coach type ${coachType} must be between ${range[0]} and ${range[1]} seats.`,
        path: ["totalSeats"],
      });
    }
  }
};

/**
 * zod validation schema for creating a coach.
 */
export const createCoachSchema = z
  .object({
    coachNumber: z
      .string()
      .trim()
      .min(1, "Coach number must be at least 1 character long")
      .toUpperCase(),
    coachType: z.enum(CoachType),
    totalSeats: z.number().int().positive(),
  })
  .superRefine((data, ctx) => {
    validateCoachCapacity(data.coachType, data.totalSeats, ctx);
  });

export type CreateCoachRequestDto = z.infer<typeof createCoachSchema>;

/**
 * zod validation schema for updating a coach.
 */
export const updateCoachSchema = z
  .object({
    coachNumber: z
      .string()
      .trim()
      .min(1, "Coach number must be at least 1 character long")
      .toUpperCase()
      .optional(),
    coachType: z.enum(CoachType).optional(),
    totalSeats: z.number().int().positive().optional(),
  })
  .superRefine((data, ctx) => {
    validateCoachCapacity(data.coachType, data.totalSeats, ctx);
  });

export type UpdateCoachRequestDto = z.infer<typeof updateCoachSchema>;

// ------------------- Coach & Seat ID Param DTOs and Schemas ------------------- //

/**
 * zod validation schema for coach id parameter.
 */
export const coachIdParamSchema = z.object({
  coachId: z.uuid("Invalid coach ID format. Must be a valid UUID."),
});

export type CoachIdParamDto = z.infer<typeof coachIdParamSchema>;

/**
 * zod validation schema for coach and seat id parameters.
 */
export const coachAndSeatIdParamSchema = z.object({
  coachId: z.uuid("Invalid coach ID format. Must be a valid UUID."),
  seatId: z.uuid("Invalid seat ID format. Must be a valid UUID."),
});

export type CoachAndSeatIdParamDto = z.infer<typeof coachAndSeatIdParamSchema>;
