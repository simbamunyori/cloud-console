import { describe, expect, it } from "vitest";
import { taxRulesFor } from "./tax-sync";

describe("tax rules for the billing engine", () => {
  it("writes a rule per country, zero where tax is off, and one for every other country", () => {
    const rules = taxRulesFor([
      { code: "bw", countries: ["BW"], taxEnabled: true, taxRateBps: 1400, taxLabel: "VAT" },
      { code: "za", countries: ["ZA"], taxEnabled: false, taxRateBps: 1500, taxLabel: "VAT" },
      { code: "global", countries: [], taxEnabled: false, taxRateBps: 0, taxLabel: "Tax" },
    ]);
    expect(rules).toEqual([
      { country: "BW", rateBps: 1400, label: "VAT" },
      { country: "ZA", rateBps: 0, label: "VAT" },
      { country: "*", rateBps: 0, label: "Tax" },
    ]);
  });
});
