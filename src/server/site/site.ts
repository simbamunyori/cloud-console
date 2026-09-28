import "server-only";
import type { Market, PrismaClient } from "@prisma/client";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { company } from "@/config/app";
import { SERVICES, type ServiceCard } from "@/config/site";
import { todayIn } from "@/lib/dates";
import { applyBps, money, type Money } from "@/lib/domain/money";
import { monthOf } from "@/lib/domain/pricing";
import { marketplace, tldOffers } from "@/server/catalogue/price-book";
import { prisma } from "@/server/db";
import { env } from "@/server/env";
import { CATCH_ALL, cachedMarkets } from "@/server/markets/markets";

/** What the public site needs, read once per request. */

export const enabledMarkets = cache(async () => (await cachedMarkets(prisma)).filter((m) => m.enabled));

/** The market for a site page. A market that doesn't exist or is switched off is a 404: the visitor asked for it by name. */
export async function siteMarket(code: string): Promise<Market> {
  const m = (await enabledMarkets()).find((x) => x.code === code);
  if (!m) notFound();
  return m;
}

/** The month whose prices the site shows, in the market's time zone. */
export const siteMonth = (m: Market) => monthOf(todayIn(m.timeZone));

/** A book price as the market shows prices: with tax added where prices are shown including it. */
export function shownPrice(m: Pick<Market, "taxEnabled" | "taxDisplay" | "taxRateBps">, price: Money): Money {
  return m.taxEnabled && m.taxDisplay === "INCLUSIVE" ? money(price.amountMinor + applyBps(price.amountMinor, m.taxRateBps), price.currency) : price;
}

/** "Prices exclude VAT." or nothing when the market charges no tax. */
export function taxNote(m: Pick<Market, "taxEnabled" | "taxDisplay" | "taxLabel">): string | null {
  if (!m.taxEnabled) return null;
  return m.taxDisplay === "INCLUSIVE" ? `Prices include ${m.taxLabel}.` : `Prices exclude ${m.taxLabel}.`;
}

export interface ServiceFrom {
  card: ServiceCard;
  from: Money | null;
  unitLabel: string | null;
}

/** Each service card with its lowest monthly price in the market's book. */
export const serviceCards = cache(async (code: string): Promise<ServiceFrom[]> => {
  const m = await siteMarket(code);
  const products = (await marketplace(prisma as unknown as PrismaClient, m, siteMonth(m))).flatMap((c) => c.products);
  return SERVICES.map((card) => {
    const matching = products.filter((p) => card.products.categories?.includes(p.product.categoryKey) || card.products.slugs?.includes(p.product.slug));
    const cheapest = matching.sort((a, b) => (a.price.amountMinor < b.price.amountMinor ? -1 : 1))[0];
    return { card, from: cheapest ? shownPrice(m, cheapest.price) : null, unitLabel: cheapest?.product.unitLabel ?? null };
  });
});

export async function pricingTables(code: string) {
  const m = await siteMarket(code);
  const month = siteMonth(m);
  const [categories, domains] = await Promise.all([marketplace(prisma as unknown as PrismaClient, m, month), tldOffers(prisma as unknown as PrismaClient, m, month)]);
  return {
    categories: categories.map((c) => ({ ...c, products: c.products.map((p) => ({ ...p, price: shownPrice(m, p.price) })) })),
    domains: domains.map((d) => ({ ...d, register: shownPrice(m, d.register), renew: shownPrice(m, d.renew) })),
  };
}

/** hreflang for a market: its locale, except the catch-all market, which is plain English. */
export const hreflang = (m: Pick<Market, "code" | "locale">) => (m.code === CATCH_ALL ? "en" : m.locale);

/**
 * Canonical URL and hreflang alternates for a site page (path after the
 * market, e.g. "/pricing"). "/" is x-default: crawlers get the default
 * market there.
 */
export async function siteMetadata(code: string, path: string, meta: { title: string; description: string }): Promise<Metadata> {
  const markets = await enabledMarkets();
  const languages: Record<string, string> = Object.fromEntries(markets.map((m) => [hreflang(m), `/${m.code}${path}`]));
  languages["x-default"] = path === "" ? "/" : `/${markets.find((m) => m.isDefault)?.code ?? code}${path}`;
  return {
    metadataBase: new URL(env().APP_URL),
    title: { absolute: meta.title },
    description: meta.description,
    alternates: { canonical: `/${code}${path}`, languages },
    openGraph: { title: meta.title, description: meta.description, url: `/${code}${path}`, siteName: company.name, type: "website" },
    robots: { index: true, follow: true },
  };
}
