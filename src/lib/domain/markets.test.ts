import { describe, expect, it } from "vitest";
import { defaultMarket, marketForCountry, type MarketRow } from "./markets";

const m = (code: string, countries: string[], enabled = true, isDefault = false): MarketRow => ({ code, countries, enabled, isDefault });
const markets = [m("bw", ["BW"], true, true), m("za", ["ZA"], false), m("zw", ["ZW"]), m("global", [], false)];

describe("choosing a market", () => {
  it("gives a billing country the market that lists it", () => {
    expect(marketForCountry("BW", markets)?.code).toBe("bw");
    expect(marketForCountry("zw", markets)?.code).toBe("zw");
  });

  it("serves nobody from a switched-off market", () => {
    expect(marketForCountry("ZA", markets)).toBeNull();
  });

  it("sends other countries to the catch-all market only when it is on", () => {
    expect(marketForCountry("KE", markets)).toBeNull();
    const withGlobal = markets.map((x) => (x.code === "global" ? { ...x, enabled: true } : x));
    expect(marketForCountry("KE", withGlobal)?.code).toBe("global");
    expect(marketForCountry("ZA", withGlobal)?.code).toBe("global");
  });

  it("falls back to the default market, or the first one that is on", () => {
    expect(defaultMarket(markets).code).toBe("bw");
    expect(defaultMarket([m("bw", ["BW"], false, true), m("zw", ["ZW"])]).code).toBe("zw");
    expect(() => defaultMarket([m("bw", ["BW"], false, true)])).toThrow();
  });
});
