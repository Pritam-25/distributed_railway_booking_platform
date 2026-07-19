import { z } from "zod";

/**
 * Zod validation schema for updating the operating days of a train.
 */
export const updateOperatingDaysSchema = z.object({
  /** Array of integers representing days of the week. 0 = Sunday, 1 = Monday, ..., 6 = Saturday */
  operatingDays: z
    .array(z.number().int().min(0).max(6), {
      message:
        "Operating days must be an array of integers between 0 (Sunday) and 6 (Saturday).",
    })
    .min(1, "Train must operate on at least one day of the week."),
});

export type UpdateOperatingDaysDto = z.infer<typeof updateOperatingDaysSchema>;
