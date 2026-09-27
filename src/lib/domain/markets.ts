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
