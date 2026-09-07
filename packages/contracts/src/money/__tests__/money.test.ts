import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  rupeesToPaise,
  paiseToRupees,
  paiseToNumber,
  addPaise,
  sumPaise,
  sumPaiseToRupees,
  calculateSeatFarePaise,
  calculateSeatFareRupees,
  moneyRupeesSchema,
  paymentChargeRupeesSchema,
} from "../index.js";

describe("Monetary Conversion & Precision Invariants", () => {
  it("converts canonical Rupee strings to integer Paise exactly", () => {
    assert.equal(rupeesToPaise("0.00"), 0n);
    assert.equal(rupeesToPaise("0.01"), 1n);
    assert.equal(rupeesToPaise("0.10"), 10n);
    assert.equal(rupeesToPaise("0.29"), 29n);
    assert.equal(rupeesToPaise("0.30"), 30n);
    assert.equal(rupeesToPaise("1.99"), 199n);
    assert.equal(rupeesToPaise("1250.50"), 125050n);
    assert.equal(rupeesToPaise("99999.99"), 9999999n);
  });

  it("converts Paise to canonical 2-decimal Rupee strings exactly", () => {
    assert.equal(paiseToRupees(0n), "0.00");
    assert.equal(paiseToRupees(1n), "0.01");
    assert.equal(paiseToRupees(10n), "0.10");
    assert.equal(paiseToRupees(29n), "0.29");
    assert.equal(paiseToRupees(30n), "0.30");
    assert.equal(paiseToRupees(199n), "1.99");
    assert.equal(paiseToRupees(125050n), "1250.50");
  });

  it("satisfies bi-directional round-trip conversion without precision loss", () => {
    const testCases = [
      "0.00",
      "0.01",
      "0.10",
      "0.29",
      "0.30",
      "1.99",
      "1250.50",
      "99999.99",
    ];
    for (const rupeeStr of testCases) {
      assert.equal(paiseToRupees(rupeesToPaise(rupeeStr)), rupeeStr);
    }
  });

  it("converts Paise to safe numbers for external SDK boundaries", () => {
    assert.equal(paiseToNumber(125050n), 125050);
    assert.equal(paiseToNumber(0n), 0);
  });
});

describe("Monetary Arithmetic & Floating-Point Hazard Elimination", () => {
  it("eliminates 0.10 + 0.20 floating-point artifact", () => {
    const a = rupeesToPaise("0.10");
    const b = rupeesToPaise("0.20");
    const totalPaise = addPaise(a, b);
    assert.equal(totalPaise, 30n);
    assert.equal(paiseToRupees(totalPaise), "0.30");
  });

  it("sums multiple seat prices with zero precision loss", () => {
    const seatPrices = ["100.10", "200.20", "300.30"];
    const totalPaise = sumPaise(seatPrices.map((p) => rupeesToPaise(p)));
    assert.equal(totalPaise, 60060n);
    assert.equal(
      sumPaiseToRupees(seatPrices.map((p) => rupeesToPaise(p))),
      "600.60",
    );
  });
});

describe("Fare Rate Calculation & Deterministic ROUND_HALF_UP Rounding", () => {
  it("correctly rounds 258.1055 to 258.11 (ROUND_HALF_UP)", () => {
    // 101 km * 2.5555 Rs/km = 258.1055 Rs -> 25810.55 paise -> 25811 paise (Rs 258.11)
    const farePaise = calculateSeatFarePaise(101, "2.5555");
    assert.equal(farePaise, 25811n);
    assert.equal(calculateSeatFareRupees(101, "2.5555"), "258.11");
  });

  it("correctly rounds 258.1049 to 258.10 (ROUND_HALF_UP)", () => {
    // 100 km * 2.581049 Rs/km = 258.1049 Rs -> 25810.49 paise -> 25810 paise (Rs 258.10)
    const farePaise = calculateSeatFarePaise(100, "2.581049");
    assert.equal(farePaise, 25810n);
    assert.equal(calculateSeatFareRupees(100, "2.581049"), "258.10");
  });

  it("correctly rounds 258.1050 to 258.11 (ROUND_HALF_UP on exact midpoint)", () => {
    const farePaise = calculateSeatFarePaise(100, "2.581050");
    assert.equal(farePaise, 25811n);
    assert.equal(calculateSeatFareRupees(100, "2.581050"), "258.11");
  });

  it("correctly computes small fractional distances (3 km * 0.3333 = 0.9999 -> 1.00)", () => {
    const farePaise = calculateSeatFarePaise(3, "0.3333");
    assert.equal(farePaise, 100n);
    assert.equal(calculateSeatFareRupees(3, "0.3333"), "1.00");
  });
});

describe("Zod Money Schema Validation", () => {
  it("accepts canonical 2-decimal strings", () => {
    const valid = ["0.00", "0.01", "0.10", "250.00", "1250.50", "99999.99"];
    for (const val of valid) {
      const parsed = moneyRupeesSchema.parse(val);
      assert.equal(parsed, val);
    }
  });

  it("rejects non-canonical strings and invalid formats", () => {
    const invalid = [
      "1250", // Missing decimals
      "1250.5", // Single decimal
      "1250.500", // Three decimals
      "₹1250.50", // Currency symbol
      "-10.00", // Negative
      "abc", // Non-numeric
      "", // Empty string
      "1250.50.50", // Malformed
    ];
    for (const val of invalid) {
      assert.throws(
        () => moneyRupeesSchema.parse(val),
        /Amount must be a canonical 2-decimal string/,
      );
    }
  });

  it("validates payment charge minimum ₹1.00", () => {
    assert.doesNotThrow(() => paymentChargeRupeesSchema.parse("1.00"));
    assert.doesNotThrow(() => paymentChargeRupeesSchema.parse("1250.50"));
    assert.throws(
      () => paymentChargeRupeesSchema.parse("0.00"),
      /Payment amount must be at least ₹1.00/,
    );
    assert.throws(
      () => paymentChargeRupeesSchema.parse("0.99"),
      /Payment amount must be at least ₹1.00/,
    );
  });
});
