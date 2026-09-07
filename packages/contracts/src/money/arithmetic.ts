import { Decimal } from "decimal.js";
import type { Paise, RupeesString } from "./types.js";
import { paiseToRupees } from "./conversion.js";

/**
 * Adds two Paise amounts exactly using BigInt addition.
 */
export function addPaise(a: Paise | bigint, b: Paise | bigint): Paise {
  return (a + b) as Paise;
}

/**
 * Subtracts one Paise amount from another exactly using BigInt subtraction.
 */
export function subtractPaise(a: Paise | bigint, b: Paise | bigint): Paise {
  return (a - b) as Paise;
}

/**
 * Sums an array of Paise amounts exactly.
 */
export function sumPaise(items: (Paise | bigint)[]): Paise {
  return items.reduce<bigint>((acc, curr) => acc + curr, 0n) as Paise;
}

/**
 * Sums an array of Paise amounts and returns the result as a canonical 2-decimal Rupee string.
 */
export function sumPaiseToRupees(items: (Paise | bigint)[]): RupeesString {
  return paiseToRupees(sumPaise(items));
}

/**
 * Calculates seat fare in Paise from distance (in km) and pricePerKm rate (Decimal(10, 4)).
 *
 * Deterministic Business Rule:
 * Calculates full precision: (distanceKm * pricePerKm * 100) and rounds to nearest Paise
 * using ROUND_HALF_UP.
 *
 * @example
 * calculateSeatFarePaise(101, "2.5555")  // 101 * 2.5555 = 258.1055 -> 25811n (₹258.11)
 * calculateSeatFarePaise(100, "2.581049") // 100 * 2.581049 = 258.1049 -> 25810n (₹258.10)
 * calculateSeatFarePaise(3, "0.3333")    // 3 * 0.3333 = 0.9999 -> 100n (₹1.00)
 */
export function calculateSeatFarePaise(
  distanceKm: number | bigint | string,
  pricePerKm: string | Decimal | { toString(): string },
): Paise {
  const dist = new Decimal(distanceKm.toString());
  const rateStr =
    typeof pricePerKm === "string" ? pricePerKm.trim() : pricePerKm.toString();
  const rate = new Decimal(rateStr);

  if (!dist.isFinite() || dist.isNegative()) {
    throw new Error(`Invalid distance: ${distanceKm}`);
  }
  if (!rate.isFinite() || rate.isNegative()) {
    throw new Error(`Invalid pricePerKm rate: ${rateStr}`);
  }

  // distance * pricePerKm gives rupees. Multiply by 100 to get paise, then ROUND_HALF_UP.
  const farePaiseStr = dist
    .mul(rate)
    .mul(100)
    .toFixed(0, Decimal.ROUND_HALF_UP);

  return BigInt(farePaiseStr) as Paise;
}

/**
 * Calculates seat fare and formats directly to a canonical 2-decimal Rupee string.
 */
export function calculateSeatFareRupees(
  distanceKm: number | bigint | string,
  pricePerKm: string | Decimal | { toString(): string },
): RupeesString {
  return paiseToRupees(calculateSeatFarePaise(distanceKm, pricePerKm));
}
