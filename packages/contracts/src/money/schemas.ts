import { z } from "zod";
import type { RupeesString } from "./types.js";

/**
 * Strict canonical 2-decimal money string representation in Rupees (e.g., "1250.50", "0.00").
 * Rejects "1250", "1250.5", "1250.500", or floats.
 */
export const moneyRupeesSchema = z
  .string()
  .regex(
    /^\d+\.\d{2}$/,
    "Amount must be a canonical 2-decimal string in Rupees (e.g. '1250.50')",
  )
  .transform((val) => val as RupeesString);

/**
 * Default currency is strictly INR.
 */
export const currencySchema = z.literal("INR");

/**
 * Reusable composite Money structure carrying amount and currency.
 */
export const moneyObjectSchema = z.object({
  amount: moneyRupeesSchema,
  currency: currencySchema.default("INR"),
});

/**
 * Specific constraint for payment charges (e.g., Razorpay minimum ₹1.00 requirement).
 */
export const paymentChargeRupeesSchema = moneyRupeesSchema.refine(
  (val) => {
    const [whole, decimal] = val.split(".");
    const wholeNum = Number(whole);
    const decNum = Number(decimal);
    return wholeNum > 0 || (wholeNum === 0 && decNum >= 100);
  },
  { message: "Payment amount must be at least ₹1.00" },
);
