import { Decimal } from "decimal.js";
import type { Paise, RupeesString } from "./types.js";

/**
 * Type-safe input representing a Decimal or string-like monetary value.
 * Intentionally rejects raw JavaScript `number` to prevent IEEE-754 precision loss.
 */
export type RupeeInput = string | Decimal | { toString(): string };

/**
 * Converts a canonical Rupee string or Decimal to integer Paise (bigint) without floating-point errors.
 * Uses ROUND_HALF_UP at the paise boundary.
 *
 * @example
 * rupeesToPaise("1250.50") // 125050n
 * rupeesToPaise("0.10")     // 10n
 * rupeesToPaise("0.29")     // 29n
 */
export function rupeesToPaise(rupees: RupeeInput): Paise {
  const str = typeof rupees === "string" ? rupees.trim() : rupees.toString();
  const dec = new Decimal(str);
  if (!dec.isFinite()) {
    throw new Error(`Invalid monetary amount: ${str}`);
  }
  // Multiply by 100 and round to nearest integer paise with ROUND_HALF_UP
  const paiseStr = dec.mul(100).toFixed(0, Decimal.ROUND_HALF_UP);
  return BigInt(paiseStr) as Paise;
}

/**
 * Converts integer Paise (bigint) to a canonical 2-decimal Rupee string.
 *
 * @example
 * paiseToRupees(125050n) // "1250.50"
 * paiseToRupees(10n)     // "0.10"
 * paiseToRupees(0n)      // "0.00"
 */
export function paiseToRupees(paise: Paise | bigint): RupeesString {
  const dec = new Decimal(paise.toString()).div(100);
  return dec.toFixed(2) as RupeesString;
}

/**
 * Converts a Rupee input directly to a canonical 2-decimal Rupee string.
 */
export function formatRupees(rupees: RupeeInput): RupeesString {
  return paiseToRupees(rupeesToPaise(rupees));
}

/**
 * Converts Paise bigint to number ONLY for external SDKs/APIs requiring number (e.g. Razorpay SDK options).
 * Throws if the amount exceeds Number.MAX_SAFE_INTEGER.
 */
export function paiseToNumber(paise: Paise | bigint): number {
  if (
    paise > BigInt(Number.MAX_SAFE_INTEGER) ||
    paise < BigInt(Number.MIN_SAFE_INTEGER)
  ) {
    throw new Error(
      `Paise amount ${paise} exceeds JavaScript Number.MAX_SAFE_INTEGER`,
    );
  }
  return Number(paise);
}
