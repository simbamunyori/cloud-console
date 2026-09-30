import { currentSession } from "@/server/auth/next";
import { showingDrafts, siteFrameContent } from "@/server/site/cms";
import { formatMoney } from "@/lib/domain/money";
import { enabledMarkets, pricingTables, siteMarket } from "@/server/site/site";
import type { FrameContent } from "./frame-content";
import { currentTheme } from "@/server/theme";
import { env } from "@/server/env";
import { LivePreview } from "./live-preview";
import { SiteFrame } from "./site-frame";

/** A public page in a market: the frame with the switcher, and "Open console" for a signed-in customer. */
export async function SitePage({ code, path, children }: { code: string; path: string; children: React.ReactNode }) {
  const [market, markets, session, theme, drafts] = await Promise.all([siteMarket(code), enabledMarkets(), currentSession(), currentTheme(), showingDrafts()]);
  const content = withFromPrices(await siteFrameContent(market), await pricingTables(code), market.locale);
  return (
    <SiteFrame market={market} markets={markets} path={path} signedIn={session?.stage === "ACTIVE"} theme={theme} statusUrl={env().STATUS_PAGE_URL} content={content}>
      {drafts ? <LivePreview /> : null}
      {children}
    </SiteFrame>
  );
}

/**
 * Each menu family's lowest monthly price, from the price book section its
 * first link points at ("/pricing#cat-servers"): the products named like
 * that link when there are any, else the whole section. A family whose
 * first link goes elsewhere shows no price rather than a guessed one.
 */
function withFromPrices(content: FrameContent, tables: Awaited<ReturnType<typeof pricingTables>>, locale: string): FrameContent {
  return {
    ...content,
    groups: content.groups.map((g) => {
      const first = g.links[0];
      const key = first?.href.match(/#cat-([\w-]+)$/)?.[1];
      const all = tables.categories.find((c) => c.category.key === key)?.products.flatMap(({ product, price }) => (price ? [{ name: product.name, price, unit: product.unitLabel }] : [])) ?? [];
      const named = all.filter((p) => p.name.toLowerCase().includes(first!.label.toLowerCase()));
      const priced = named.length ? named : all;
      const low = priced.sort((a, b) => (a.price.amountMinor < b.price.amountMinor ? -1 : 1))[0];
      return low ? { ...g, from: `From ${formatMoney(low.price, locale)} ${low.unit} a month` } : g;
    }),
  };
}
