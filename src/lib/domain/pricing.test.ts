import { describe, expect, it } from "vitest";
import { money } from "./money";
import { customerPrice, PricingError, roundUpToUnit } from "./pricing";

describe("customer prices", () => {
  it("converts, adds the buffer and the margin, then rounds up to a whole pula", () => {
    // US$ 12.50 at P 13.45, 3% buffer, 20% margin:
    // 1250 * 13.45 = 16812.5 -> 16813; +3% = 17317 (504.39 -> 504); +20% = 20780 (3463.4 -> 3463); up to P 208.00.
    const { price, breakdown } = customerPrice({ cost: money(1250n, "USD"), marginBps: 2000, bufferBps: 300, rateMicros: 13_450_000n }, "BWP");
    expect(breakdown).toMatchObject({ converted: "16813", afterBuffer: "17317", afterMargin: "20780", price: "20800", bufferBps: 300, fixed: false });
    expect(price).toEqual(money(20800n, "BWP"));
  });

  it("skips conversion and buffer for local costs", () => {
    const { price, breakdown } = customerPrice({ cost: money(30000n, "BWP"), marginBps: 4000, bufferBps: 300 }, "BWP");
    expect(breakdown).toMatchObject({ converted: "30000", bufferBps: 0, afterMargin: "42000" });
    expect(price).toEqual(money(42000n, "BWP"));
  });

  it("uses a fixed price as it is", () => {
    const { price, breakdown } = customerPrice({ cost: money(0n, "BWP"), fixedPrice: money(65000n, "BWP"), marginBps: 2500, bufferBps: 300 }, "BWP");
    expect(price).toEqual(money(65000n, "BWP"));
    expect(breakdown.fixed).toBe(true);
    expect(() => customerPrice({ cost: money(0n, "BWP"), fixedPrice: money(1n, "USD"), marginBps: 0, bufferBps: 0 }, "BWP")).toThrow(PricingError);
  });

  it("refuses to price without a rate, or with a negative margin", () => {
    expect(() => customerPrice({ cost: money(100n, "USD"), marginBps: 0, bufferBps: 0 }, "BWP")).toThrow(/rate/);
    expect(() => customerPrice({ cost: money(100n, "BWP"), marginBps: -1, bufferBps: 0 }, "BWP")).toThrow(PricingError);
  });

  it("never rounds down", () => {
    expect(roundUpToUnit(20001n, "BWP")).toBe(20100n);
    expect(roundUpToUnit(20000n, "BWP")).toBe(20000n);
    expect(roundUpToUnit(0n, "BWP")).toBe(0n);
  });
});
