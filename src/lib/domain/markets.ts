import type { Market } from "@prisma/client";

/** Choosing a market for a billing country or a visitor. Pure, so it is tested without a database. */

/** The market that serves every country no other market claims. */
export const CATCH_ALL = "global";

export type MarketRow = Pick<Market, "code" | "countries" | "enabled" | "isDefault">;

/**
 * The market a billing country belongs to, among enabled markets: the one
 * that lists the country, else the catch-all market if it is on. Null
 * means we don't serve that country yet.
 */
export function marketForCountry<M extends MarketRow>(country: string, markets: M[]): M | null {
  const code = country.toUpperCase();
  const on = markets.filter((m) => m.enabled);
  return on.find((m) => m.countries.includes(code)) ?? on.find((m) => m.code === CATCH_ALL) ?? null;
}

/** The market visitors get when theirs can't be told or is switched off. */
export function defaultMarket<M extends MarketRow>(markets: M[]): M {
  const m = markets.find((x) => x.isDefault && x.enabled) ?? markets.find((x) => x.enabled);
  if (!m) throw new Error("No market is switched on.");
  return m;
}

/** The cookie that remembers the market a visitor chose. */
export const MARKET_COOKIE = "market";

/** Search engine and link preview crawlers. They are never redirected. */
const CRAWLER = /bot\b|crawler|spider|slurp|bingpreview|facebookexternalhit|embedly|quora link preview|whatsapp|telegrambot|lighthouse|chrome-lighthouse|google-inspectiontool|applebot|duckduckgo/i;

export function isCrawler(userAgent: string | null | undefined): boolean {
  return Boolean(userAgent && CRAWLER.test(userAgent));
}

export type MarketReason = "cookie" | "country" | "default";

/**
 * The market for a visitor on "/": the one they chose (the cookie), else
 * the one for their country, else the default. A cookie or country whose
 * market is switched off falls through, so nobody who didn't ask for a
 * particular market lands on a page that isn't there.
 */
export function chooseMarket<M extends MarketRow>(markets: M[], visitor: { cookie?: string | null; country?: string | null }): { market: M; reason: MarketReason } {
  const chosen = visitor.cookie ? markets.find((m) => m.enabled && m.code === visitor.cookie) : undefined;
  if (chosen) return { market: chosen, reason: "cookie" };
  const byCountry = visitor.country ? marketForCountry(visitor.country, markets) : null;
  if (byCountry) return { market: byCountry, reason: "country" };
  return { market: defaultMarket(markets), reason: "default" };
}
