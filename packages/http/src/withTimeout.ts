/**
 * ## module/withTimeout
 *
 * Bounded `Promise.race` wrapper that rejects a step after `ms` if it does
 * not complete in time. Used by every service's startup and shutdown
 * sequence so a hung dependency cannot keep the pod alive past the k8s
 * grace window.
 */

/**
 * Executes a promise-based operation with a maximum timeout threshold.
 *
 * @param label - Diagnostic label used in the timeout error message.
 * @param op    - Promise to await.
 * @param ms    - Timeout limit in milliseconds (@default: 10000).
 * @returns A promise resolving to the operation result.
 * @throws {Error} If the timeout is reached before the operation completes.
 */
export const withTimeout = async <T>(
  label: string,
  op: Promise<T>,
  ms = 10000,
): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      op,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};
