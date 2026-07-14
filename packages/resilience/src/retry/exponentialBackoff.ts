import z from "zod";

export interface BackoffOptions {
  retries?: number;
  initialMs?: number;
  maxMs?: number;
}

export const BackoffOptionsSchema = z
  .object({
    retries: z.number().int().positive().max(50).default(5),
    initialMs: z.number().int().positive().max(1000).default(100),
    maxMs: z.number().int().positive().max(30000).default(10000),
  })
  .refine((data) => data.maxMs > data.initialMs, {
    message: "maxMs must be greater than initialMs",
  });

/**
 * Executes a function with exponential backoff strategy.
 *
 * - Retries function on failure.
 * - Delay between retries increases exponentially.
 * - Maximum delay is capped at `maxMs`.
 *
 * @param fn - Async function to execute.
 * @param options - Configuration for backoff strategy.
 * @returns Promise resolving to the function's return value.
 */
export async function withExponentialBackoff<T>(
  fn: () => Promise<T>,
  options?: BackoffOptions,
): Promise<T> {
  const validated = BackoffOptionsSchema.parse(options ?? {});

  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error) {
      attempt++;
      if (attempt > validated.retries) {
        throw error;
      }
      const delay = Math.min(
        validated.maxMs,
        validated.initialMs * Math.pow(2, attempt - 1),
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
