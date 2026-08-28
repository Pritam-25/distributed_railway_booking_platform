import type { BoundedStep } from "../types.js";
import { withTimeout } from "./withTimeout.js";

/**
 * Runs a list of async bootstrap steps sequentially, wrapping each in `withTimeout`.
 * Rejects immediately if any step fails or times out.
 *
 * @param steps - Array of lifecycle steps `[label, actionFn, timeoutMs?]`.
 */
export const runSteps = async (steps: BoundedStep[]): Promise<void> => {
  for (const [label, action, timeoutMs] of steps) {
    await withTimeout(label, action(), timeoutMs);
  }
};

/**
 * Runs a list of async shutdown steps sequentially, wrapping each in `withTimeout`.
 * If `ignoreErrors` is true (e.g. during emergency cleanup in `onFailure`), errors are caught silently.
 *
 * @param steps        - Array of lifecycle steps `[label, actionFn, timeoutMs?]`.
 * @param ignoreErrors - If true, swallows step rejections without aborting remaining steps.
 */
export const runShutdownSteps = async (
  steps: BoundedStep[],
  ignoreErrors = false,
): Promise<void> => {
  for (const [label, action, timeoutMs] of steps) {
    if (ignoreErrors) {
      await withTimeout(label, action(), timeoutMs).catch(() => {});
    } else {
      await withTimeout(label, action(), timeoutMs);
    }
  }
};
