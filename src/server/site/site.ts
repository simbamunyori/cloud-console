import "server-only";
import type { Market, PrismaClient } from "@prisma/client";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { company } from "@/config/app";
import { selection } from "@/server/cms/catalogue-options";
import { SERVICES, type ServiceCard } from "@/config/site";
import { todayIn } from "@/lib/dates";
import { applyBps, money, type Money } from "@/lib/domain/money";
import { monthOf } from "@/lib/domain/pricing";
import { marketplace, tldOffers } from "@/server/catalogue/price-book";
import { prisma } from "@/server/db";
import { env } from "@/server/env";
import { faqOf } from "@/server/launch/kits";
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

/** A product on sale in a market, with its price as the market shows it. */
export interface SitePrice {
  slug: string;
  name: string;
  summary: string;
  categoryKey: string;
  unitLabel: string;
  price: Money;
}

/** Every product on sale in the market this month, in catalogue order. */
export const sitePrices = cache(async (code: string): Promise<SitePrice[]> => {
  const m = await siteMarket(code);
  return (await marketplace(prisma as unknown as PrismaClient, m, siteMonth(m))).flatMap((c) =>
    c.products.flatMap(({ product: p, price }) => (price ? [{ slug: p.slug, name: p.name, summary: p.summary, categoryKey: p.categoryKey, unitLabel: p.unitLabel, price: shownPrice(m, price) }] : [])),
  );
});

/** The products a selection names: whole categories or single products. */
export const selected = (prices: SitePrice[], sel: { categories?: string[]; products?: string[]; slugs?: string[] }) =>
  prices.filter((p) => sel.categories?.includes(p.categoryKey) || sel.products?.includes(p.slug) || sel.slugs?.includes(p.slug));

/** The cheapest of the selected products, or null when none is on sale in the market. */
export function lowestPrice(prices: SitePrice[], sel: Parameters<typeof selected>[1]): SitePrice | null {
  return selected(prices, sel).sort((a, b) => (a.price.amountMinor < b.price.amountMinor ? -1 : 1))[0] ?? null;
}

/** A product's own page on the site. */
export const productPath = (code: string, slug: string) => `/${code}/products/${slug}`;

/** Products whose page a website Publisher approved (Milestone 7). */
export const approvedProductPages = cache(async () => {
  const kits = await prisma.launchKit.findMany({ where: { pageApprovedAt: { not: null } }, select: { product: { select: { slug: true } } } });
  return new Set(kits.map((k) => k.product.slug));
});

/** Where to read about a product: its own page once approved, otherwise its family on the pricing page. */
export async function productHref(code: string, p: { slug: string; categoryKey: string }) {
  return (await approvedProductPages()).has(p.slug) ? productPath(code, p.slug) : `/${code}/pricing#cat-${p.categoryKey}`;
}

/**
 * A product page: only for a product on sale in the market (priced, or
 * sold by quote) whose page a Publisher approved. Otherwise null.
 */
export const productPage = cache(async (code: string, slug: string) => {
  const m = await siteMarket(code);
  const kit = await prisma.launchKit.findFirst({ where: { pageApprovedAt: { not: null }, product: { slug } } });
  if (!kit) return null;
  const entry = (await marketplace(prisma as unknown as PrismaClient, m, siteMonth(m))).flatMap((c) => c.products).find((e) => e.product.slug === slug);
  if (!entry) return null;
  return { m, product: entry.product, price: entry.price ? shownPrice(m, entry.price) : null, audience: kit.audience, faq: faqOf(kit.faq) };
});

/** The approved product pages on sale in a market, for the sitemap. */
export async function productPageSlugs(code: string): Promise<string[]> {
  const m = await siteMarket(code);
  const approved = await approvedProductPages();
  return (await marketplace(prisma as unknown as PrismaClient, m, siteMonth(m))).flatMap((c) => c.products.map((e) => e.product.slug)).filter((s) => approved.has(s));
}

/** The first on-sale product a catalogue choice names, with where to read about it, or null. */
export async function relatedProduct(code: string, value: unknown): Promise<(SitePrice & { href: string }) | null> {
  const product = selected(await sitePrices(code), selection(value))[0];
  return product ? { ...product, href: await productHref(code, product) } : null;
}

/** Each service card with its lowest monthly price in the market's book. */
export const serviceCards = cache(async (code: string): Promise<ServiceFrom[]> => {
  const prices = await sitePrices(code);
  return SERVICES.map((card) => {
    const cheapest = lowestPrice(prices, card.products);
    return { card, from: cheapest?.price ?? null, unitLabel: cheapest?.unitLabel ?? null };
  });
});

export const pricingTables = cache(async (code: string) => {
  const m = await siteMarket(code);
  const month = siteMonth(m);
  const [categories, domains] = await Promise.all([marketplace(prisma as unknown as PrismaClient, m, month), tldOffers(prisma as unknown as PrismaClient, m, month)]);
  return {
    categories: categories.map((c) => ({ ...c, products: c.products.map((p) => ({ ...p, price: p.price ? shownPrice(m, p.price) : null })) })),
    domains: domains.map((d) => ({ ...d, register: shownPrice(m, d.register), renew: shownPrice(m, d.renew) })),
  };
});

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
