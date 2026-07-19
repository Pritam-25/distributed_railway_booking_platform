import { z } from "zod";
import { ScheduleStatus } from "@generated/prisma/enums.js";

/**
 * Zod validation schema and DTO for creating a schedule.
 */
export const createScheduleSchema = z.object({
  trainId: z.uuid("Invalid train ID format. Must be a valid UUID."),
  departureDate: z.coerce.date().refine((date) => date > new Date(), {
    message: "Journey date must be in the future.",
  }),
});

export type CreateScheduleRequestDto = z.infer<typeof createScheduleSchema>;

/**
 * Zod validation schema and DTO for updating a schedule status.
 */
export const updateScheduleStatusSchema = z.object({
  status: z.enum(ScheduleStatus, {
    message: "Invalid schedule status value.",
  }),
});

export type UpdateScheduleStatusRequestDto = z.infer<
  typeof updateScheduleStatusSchema
>;

/**
 * Zod validation schema and DTO for listing schedules.
 */
export const listSchedulesQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().default(10),
  trainId: z.uuid().optional(),
  status: z.enum(ScheduleStatus).optional(),
});

export type ListSchedulesQueryDto = z.infer<typeof listSchedulesQuerySchema>;

/**
 * Zod validation schema and DTO for schedule ID parameter.
 */
export const scheduleIdParamSchema = z.object({
  scheduleId: z.uuid("Invalid schedule ID format. Must be a valid UUID."),
});

export type ScheduleIdParamDto = z.infer<typeof scheduleIdParamSchema>;
