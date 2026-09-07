/**
 * Strongly-typed monetary unit branded types.
 * Prevents accidental mixing of Paise, Rupees strings, and numeric scalars.
 */

declare const PaiseBrand: unique symbol;
export type Paise = bigint & { readonly [PaiseBrand]: true };

declare const RupeesStringBrand: unique symbol;
export type RupeesString = string & { readonly [RupeesStringBrand]: true };

declare const FareRateStringBrand: unique symbol;
export type FareRateString = string & { readonly [FareRateStringBrand]: true };

export type CurrencyCode = "INR";
