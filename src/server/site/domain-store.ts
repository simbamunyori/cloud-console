import "server-only";
import type { Market } from "@prisma/client";
import { formatMoney } from "@/lib/domain/money";
import { billingAdapter } from "@/server/billing";
import { prisma } from "@/server/db";
import { tldOffers } from "@/server/catalogue/price-book";
import { findDomains } from "@/server/orders/orders";
import { domainCheck } from "@/server/domains/active";
import { shownPrice, siteMonth } from "./site";

/** One row of the site's domain search: a name, whether it can be had, and its yearly price as the market shows prices. */
export interface StoreResult {
  name: string;
  state: "available" | "taken" | "unsupported";
  /** "P 250.00", with tax where the market shows prices with tax. */
  price: string | null;
  /** For a taken name: the first free one in these results. */
  alternative: string | null;
}

/** Searches the market's endings with the price book's yearly prices. Throws DomainError for a name that can't be one. */
export async function storeSearch(m: Market, query: string): Promise<StoreResult[]> {
  const found = await findDomains(prisma, domainCheck(prisma, (name) => billingAdapter().checkDomain(name)), m, query, siteMonth(m));
  const rows = found.map((r): StoreResult => ({
    name: r.name,
    state: !r.supported || !r.price ? "unsupported" : r.available ? "available" : "taken",
    price: r.supported && r.price ? formatMoney(shownPrice(m, r.price), m.locale) : null,
    alternative: null,
  }));
  const free = rows.find((r) => r.state === "available")?.name ?? null;
  return rows.filter((r) => r.state !== "unsupported").map((r) => (r.state === "taken" ? { ...r, alternative: free } : r));
}

/** The cart's names as they stand now: each checked again, with this month's price. Names whose ending the market doesn't sell are left out. */
export async function cartLines(m: Market, names: string[]): Promise<StoreResult[]> {
  const offers = [...(await tldOffers(prisma, m, siteMonth(m)))].sort((a, b) => b.tld.length - a.tld.length);
  const lines = await Promise.all(
    names.map(async (name): Promise<StoreResult | null> => {
      const offer = offers.find((o) => name.endsWith(o.tld));
      if (!offer) return null;
      const check = await domainCheck(prisma, (n) => billingAdapter().checkDomain(n))(name).catch(() => null);
      return { name, state: check ? (check.available ? "available" : "taken") : "unsupported", price: formatMoney(shownPrice(m, offer.register), m.locale), alternative: null };
    }),
  );
  return lines.filter((l): l is StoreResult => Boolean(l));
}
