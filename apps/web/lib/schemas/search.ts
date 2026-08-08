import { z } from "zod"
import { SearchTrainsCategory } from "@/generated"

/**
 * ## Search Form Schema
 *
 * Zod schema + inferred TS type for the train-search form. Validates
 * client-side before pushing the values into URL search params.
 *
 * The form accepts either a station code (e.g. "NDLS") or a UUID — the
 * backend resolves it against the existing stations index. We don't
 * enforce UUID format here so users can paste either.
 *
 * @packageDocumentation
 */

/**
 * Train category enum, mirrored from the orval-generated
 * `SearchTrainsCategory` const object.
 */
const searchTrainsCategoryValues = Object.values(SearchTrainsCategory) as [
  SearchTrainsCategory,
  ...SearchTrainsCategory[],
]

/**
 * SearchFormSchema — the typed shape of the search form.
 *
 * Used by `searchForm.tsx` via `useForm({ resolver: zodResolver(SearchFormSchema) })`.
 */
export const SearchFormSchema = z
  .object({
    fromStation: z.string().trim().min(1, "Origin station is required."),
    toStation: z.string().trim().min(1, "Destination station is required."),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a valid date (YYYY-MM-DD)."),
    category: z.enum(searchTrainsCategoryValues).optional(),
  })
  .refine((value) => value.fromStation !== value.toStation, {
    message: "Origin and destination must be different stations.",
    path: ["toStation"],
  })

/**
 * Inferred TS type for the search form values.
 */
export type SearchFormValues = z.infer<typeof SearchFormSchema>
