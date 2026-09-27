import { describe, expect, it } from "vitest";
import { chooseMarket, defaultMarket, isCrawler, marketForCountry, type MarketRow } from "./markets";

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

describe("choosing a visitor's market", () => {
  const markets = [
    { code: "bw", countries: ["BW"], enabled: true, isDefault: true },
    { code: "za", countries: ["ZA"], enabled: true, isDefault: false },
    { code: "zw", countries: ["ZW"], enabled: false, isDefault: false },
    { code: "global", countries: [], enabled: false, isDefault: false },
  ];

  it("follows the visitor's choice first", () => {
    expect(chooseMarket(markets, { cookie: "za", country: "BW" })).toMatchObject({ market: { code: "za" }, reason: "cookie" });
  });

  it("then their country", () => {
    expect(chooseMarket(markets, { country: "ZA" })).toMatchObject({ market: { code: "za" }, reason: "country" });
  });

  it("falls back to the default market, not /global, when the country's market or /global is off", () => {
    expect(chooseMarket(markets, { country: "ZW" })).toMatchObject({ market: { code: "bw" }, reason: "default" });
    expect(chooseMarket(markets, { country: "FR" })).toMatchObject({ market: { code: "bw" }, reason: "default" });
    expect(chooseMarket(markets, {})).toMatchObject({ market: { code: "bw" }, reason: "default" });
  });

  it("ignores a remembered choice whose market was switched off, or that isn't a market", () => {
    expect(chooseMarket(markets, { cookie: "zw", country: "ZA" }).market.code).toBe("za");
    expect(chooseMarket(markets, { cookie: "../admin" }).market.code).toBe("bw");
  });

  it("sends countries no market lists to /global once it is on", () => {
    const withGlobal = markets.map((m) => (m.code === "global" ? { ...m, enabled: true } : m));
    expect(chooseMarket(withGlobal, { country: "FR" }).market.code).toBe("global");
  });

  it("knows a crawler from a person", () => {
    expect(isCrawler("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")).toBe(true);
    expect(isCrawler("Mozilla/5.0 (compatible; bingbot/2.0)")).toBe(true);
    expect(isCrawler("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36")).toBe(false);
    expect(isCrawler(null)).toBe(false);
  });
});
