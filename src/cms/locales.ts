/**
 * Each market's content is a Payload locale, so one page can read
 * differently in each market. A market with no content of its own shows
 * the default market's (Botswana). A new market needs its code added here.
 */
export const MARKET_LOCALES = [
  { code: "bw", label: "Botswana" },
  { code: "za", label: "South Africa" },
  { code: "zw", label: "Zimbabwe" },
  { code: "global", label: "Global" },
] as const;

export const DEFAULT_LOCALE = "bw";

export type MarketLocale = (typeof MARKET_LOCALES)[number]["code"];

export const isMarketLocale = (code: string): code is MarketLocale => MARKET_LOCALES.some((l) => l.code === code);
